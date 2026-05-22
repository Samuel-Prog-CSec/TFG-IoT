#!/usr/bin/env node
/**
 * @fileoverview Security gate de CI: ejecuta `npm audit --omit=dev --json` en un
 * workspace y falla si quedan vulnerabilidades de producción que no estén
 * explícitamente excluidas por GHSA-id.
 *
 * Reemplaza al helper shell+Node inline que estaba embebido en
 * `.github/workflows/build.yml` y que rompía cuando una vulnerabilidad llegaba
 * por dos rutas (objeto directo con `url` + string transitivo que no se cruzaba
 * con la lista). Aquí recorremos el árbol `vulnerabilities` recursivamente y
 * consideramos cubierta una vuln cuando todas las hojas de su árbol resuelven a
 * un GHSA listado en `excluded`.
 *
 * Uso:
 *   node backend/scripts/audit-with-exclusions.js \
 *     --workspace <backend|frontend> \
 *     --excluded GHSA-xxxx-xxxx-xxxx,GHSA-yyyy-yyyy-yyyy \
 *     [--label "Backend"]
 *
 * Exit codes:
 *   0 — audit limpio o todas las vulns están en la lista de exclusiones
 *   1 — al menos una vuln no excluida (se imprime el árbol para diagnóstico) o
 *       error de invocación
 *
 * El script es invocado desde CI con `set -e`, así que un exit 1 detiene el
 * job. Para depuración local: `node ... && echo OK || echo FAIL`.
 *
 * Sin dependencias externas: solo `node:child_process` y `node:path`.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

// ─── Lógica pura (testeable) ──────────────────────────────────────────────────

/**
 * Devuelve el GHSA-id contenido en `via[i].url` o `null` si no se puede
 * extraer. La URL típica es `https://github.com/advisories/GHSA-xxxx-xxxx-xxxx`.
 * Si el campo `url` no existe pero existe `source` numérico, devuelve `null`
 * (no tratamos los advisory IDs numéricos como equivalentes a GHSA-ids).
 *
 * @param {object} viaEntry - Entrada `via[i]` cuando es objeto.
 * @returns {string|null} GHSA-id o null si no se puede determinar.
 */
function extractGhsa(viaEntry) {
  if (!viaEntry || typeof viaEntry !== 'object') {
    return null;
  }
  if (typeof viaEntry.url === 'string' && viaEntry.url.length > 0) {
    const tail = viaEntry.url.split('/').pop();
    if (tail && tail.startsWith('GHSA-')) {
      return tail;
    }
  }
  return null;
}

/**
 * Determina si una vuln (identificada por su nombre dentro de `vulnerabilities`)
 * está completamente cubierta por la lista de exclusiones. Una vuln está
 * cubierta cuando, para cada elemento de su `via`:
 *   - es objeto cuyo GHSA-id está en `excluded`, o
 *   - es string (nombre de otra vuln) y esa vuln transitiva también está
 *     cubierta recursivamente.
 *
 * Si una sola hoja no se puede mapear a un GHSA excluido, la vuln se considera
 * NO cubierta (real).
 *
 * Se mantiene un `visited` para cortar ciclos en la recursión.
 *
 * @param {string} vulnName - Clave en `vulnerabilities`.
 * @param {object} vulnerabilities - Mapa completo `name → vuln`.
 * @param {Set<string>} excluded - GHSA-ids excluidos.
 * @param {Set<string>} visited - Acumulador para evitar ciclos.
 * @returns {boolean} true si la vuln está cubierta por las exclusiones.
 */
function isCovered(vulnName, vulnerabilities, excluded, visited = new Set()) {
  if (visited.has(vulnName)) {
    return true;
  } // ciclo: asumimos cubierto para no contar dos veces
  visited.add(vulnName);

  const vuln = vulnerabilities[vulnName];
  if (!vuln || !Array.isArray(vuln.via) || vuln.via.length === 0) {
    // Sin via no podemos juzgar — fallamos seguro: no cubierta.
    return false;
  }

  return vuln.via.every(entry => {
    if (typeof entry === 'string') {
      // Transitiva por nombre — recursar si la vuln referenciada existe.
      if (entry === vulnName) {
        return true;
      } // self-reference, ya cubierto por el ciclo
      if (!vulnerabilities[entry]) {
        return false;
      }
      return isCovered(entry, vulnerabilities, excluded, visited);
    }
    const ghsa = extractGhsa(entry);
    if (ghsa) {
      return excluded.has(ghsa);
    }
    // Objeto sin GHSA derivable (futuras estructuras de npm audit) — falla seguro.
    return false;
  });
}

/**
 * Recorre el árbol de vulnerabilidades y devuelve dos listas:
 *   - `real`: nombres de vulns NO cubiertas por las exclusiones.
 *   - `covered`: nombres de vulns cubiertas.
 *
 * Los GHSAs concretos vistos se anexan en `seenGhsas` para diagnóstico.
 *
 * @param {object} auditData - JSON parseado de `npm audit --json`.
 * @param {Set<string>} excluded - GHSA-ids excluidos.
 * @returns {{real: string[], covered: string[], seenGhsas: string[]}}
 */
function analyzeVulnerabilities(auditData, excluded) {
  const vulnerabilities = (auditData && auditData.vulnerabilities) || {};
  const real = [];
  const covered = [];
  const seenGhsas = new Set();

  for (const name of Object.keys(vulnerabilities)) {
    const vuln = vulnerabilities[name];
    if (Array.isArray(vuln.via)) {
      for (const entry of vuln.via) {
        const ghsa = extractGhsa(entry);
        if (ghsa) {
          seenGhsas.add(ghsa);
        }
      }
    }
    if (isCovered(name, vulnerabilities, excluded)) {
      covered.push(name);
    } else {
      real.push(name);
    }
  }

  return { real, covered, seenGhsas: Array.from(seenGhsas).sort() };
}

// ─── CLI / I/O ────────────────────────────────────────────────────────────────

/**
 * Parsea argumentos `--key value` o `--key=value`. Args no reconocidos se
 * ignoran (resilient a flags futuros).
 *
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {{workspace: string, excluded: string, label: string}}
 */
function parseArgs(argv) {
  const out = { workspace: '', excluded: '', label: '' };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const eq = token.indexOf('=');
    let key;
    let value;
    if (eq >= 0) {
      key = token.slice(2, eq);
      value = token.slice(eq + 1);
    } else {
      key = token.slice(2);
      value = argv[i + 1];
      i++;
    }
    if (key in out && typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Lanza `npm audit --omit=dev --json` en el workspace indicado y devuelve el
 * JSON parseado. npm exits ≠ 0 cuando hay vulns; capturamos stdout igualmente.
 *
 * @param {string} workspacePath - Ruta absoluta al workspace (backend/frontend).
 * @returns {object} JSON parseado.
 * @throws {Error} Si npm no responde o el JSON no se puede parsear.
 */
function runNpmAudit(workspacePath) {
  // El binario `npm` se resuelve desde PATH — esperado en CI y en local con Node.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- script CI/local, no hostil
  const result = spawnSync('npm', ['--prefix', workspacePath, 'audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (result.error) {
    throw new Error(`No se pudo ejecutar npm audit: ${result.error.message}`);
  }
  const stdout = result.stdout || '';
  try {
    return JSON.parse(stdout);
  } catch (err) {
    const preview = stdout.slice(0, 500);
    throw new Error(
      `No se pudo parsear la salida JSON de npm audit (${err.message}). Preview: ${preview}`
    );
  }
}

function printVulnTree(name, vuln, indent = '  ') {
  console.error(`${indent}- ${name} (${vuln.severity || 'unknown'})`);
  if (Array.isArray(vuln.via)) {
    for (const entry of vuln.via) {
      if (typeof entry === 'string') {
        console.error(`${indent}  via: ${entry} (transitiva)`);
      } else if (entry && typeof entry === 'object') {
        const ghsa = extractGhsa(entry) || 'sin GHSA';
        const title = entry.title || entry.name || '';
        console.error(`${indent}  via: ${ghsa} — ${title}`);
      }
    }
  }
}

/**
 * Ejecuta la lógica completa de audit y devuelve el exit code numérico.
 * Centraliza I/O y formatos de mensaje para que `main` sea trivial.
 *
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {number} 0 si limpio o todas excluidas; 1 si hay vulns reales o args inválidos.
 */
function runAudit(argv) {
  const args = parseArgs(argv);
  if (!args.workspace) {
    console.error('Falta --workspace <backend|frontend>');
    return 1;
  }

  const label = args.label || args.workspace;
  const excluded = new Set(
    args.excluded
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  const repoRoot = path.resolve(__dirname, '..', '..');
  const workspacePath = path.join(repoRoot, args.workspace);

  let auditData;
  try {
    auditData = runNpmAudit(workspacePath);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const { real, covered, seenGhsas } = analyzeVulnerabilities(auditData, excluded);

  if (real.length === 0) {
    if (covered.length === 0) {
      console.log(`OK ${label} audit limpio`);
    } else {
      console.log(
        `OK ${label} audit: ${covered.length} vulnerabilidad(es) cubierta(s) por exclusiones documentadas`
      );
      console.log(`   Excluidas vistas: ${Array.from(excluded).sort().join(', ')}`);
      console.log(`   GHSAs detectadas: ${seenGhsas.join(', ') || '(ninguna)'}`);
    }
    return 0;
  }

  console.error(`FAIL ${label}: ${real.length} vulnerabilidad(es) de producción NO excluida(s)`);
  for (const name of real) {
    printVulnTree(name, auditData.vulnerabilities[name]);
  }
  console.error('');
  console.error(`GHSAs vistas en el árbol: ${seenGhsas.join(', ') || '(ninguna)'}`);
  console.error(
    `Exclusiones configuradas: ${Array.from(excluded).sort().join(', ') || '(ninguna)'}`
  );
  console.error(
    'Si la vuln no es alcanzable en este proyecto, añade su GHSA-id a la lista correspondiente en .github/workflows/build.yml y documenta el motivo.'
  );
  return 1;
}

// Si se importa como módulo (tests), no ejecutar nada.
if (require.main === module) {
  // eslint-disable-next-line sonarjs/process-argv -- script CLI, args sanitizados por parseArgs
  process.exit(runAudit(process.argv.slice(2)));
}

module.exports = {
  extractGhsa,
  isCovered,
  analyzeVulnerabilities,
  parseArgs
};
