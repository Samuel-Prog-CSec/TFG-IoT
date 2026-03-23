/**
 * @fileoverview Script para generar y subir imagenes seed a Supabase Storage.
 * Genera imagenes programaticamente con sharp para cada contexto del seeder,
 * y descarga banderas de flagcdn.com para el contexto de geografia.
 *
 * Uso: npm run seed:storage
 *
 * @module scripts/seed-storage-assets
 */

const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const path = require('node:path');

// Cargar variables de entorno desde .env (root o backend)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'game-assets';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tamanos de imagen
const MAIN_SIZE = 512;
const THUMB_SIZE = 256;

// ── Definicion de assets por contexto ────────────────────────────────────────

const CONTEXT_ASSETS = {
  'geography-europe': {
    method: 'flags',
    assets: [
      { key: 'spain', code: 'es' },
      { key: 'france', code: 'fr' },
      { key: 'italy', code: 'it' },
      { key: 'germany', code: 'de' },
      { key: 'portugal', code: 'pt' },
      { key: 'greece', code: 'gr' }
    ]
  },
  'animals-farm': {
    method: 'twemoji',
    assets: [
      { key: 'cow', codepoint: '1f404', bgColor: '#2d5016' },
      { key: 'pig', codepoint: '1f437', bgColor: '#4a1942' },
      { key: 'chicken', codepoint: '1f414', bgColor: '#3d2b1f' },
      { key: 'horse', codepoint: '1f434', bgColor: '#1a3a1a' },
      { key: 'duck', codepoint: '1f986', bgColor: '#1a2a4a' },
      { key: 'cat', codepoint: '1f431', bgColor: '#2a1a3a' }
    ]
  },
  'colors-basic': {
    method: 'color-swatch',
    assets: [
      { key: 'red', color: '#EF4444', bgColor: '#1a0505' },
      { key: 'blue', color: '#3B82F6', bgColor: '#050a1a' },
      { key: 'green', color: '#22C55E', bgColor: '#051a0a' },
      { key: 'yellow', color: '#EAB308', bgColor: '#1a1505' },
      { key: 'orange', color: '#F97316', bgColor: '#1a0f05' },
      { key: 'purple', color: '#A855F7', bgColor: '#0f051a' }
    ]
  },
  'numbers-1-15': {
    method: 'number',
    assets: [
      { key: 'one', number: 1, color: '#F87171', bgColor: '#1c1917' },
      { key: 'two', number: 2, color: '#60A5FA', bgColor: '#1c1917' },
      { key: 'three', number: 3, color: '#34D399', bgColor: '#1c1917' },
      { key: 'four', number: 4, color: '#FBBF24', bgColor: '#1c1917' },
      { key: 'five', number: 5, color: '#A78BFA', bgColor: '#1c1917' },
      { key: 'six', number: 6, color: '#F472B6', bgColor: '#1c1917' }
    ]
  },
  'shapes-basic': {
    method: 'shape',
    assets: [
      { key: 'circle', shape: 'circle', color: '#F87171', bgColor: '#1c1917' },
      { key: 'square', shape: 'square', color: '#60A5FA', bgColor: '#1c1917' },
      { key: 'triangle', shape: 'triangle', color: '#34D399', bgColor: '#1c1917' },
      { key: 'star', shape: 'star', color: '#FBBF24', bgColor: '#1c1917' },
      { key: 'heart', shape: 'heart', color: '#F472B6', bgColor: '#1c1917' },
      { key: 'diamond', shape: 'diamond', color: '#A78BFA', bgColor: '#1c1917' }
    ]
  }
};

// ── Generadores de imagenes ─────────────────────────────────────────────────

/**
 * Descarga una bandera de flagcdn.com y la convierte a WebP.
 */
async function generateFlagImage(countryCode, size) {
  // flagcdn.com: SVG es la opcion mas fiable
  const urls = [
    `https://flagcdn.com/${countryCode}.svg`,
    `https://flagcdn.com/w640/${countryCode}.png`,
    `https://flagcdn.com/w320/${countryCode}.png`
  ];

  let buffer;
  for (const url of urls) {
    const response = await fetch(url);
    if (response.ok) {
      buffer = Buffer.from(await response.arrayBuffer());
      break;
    }
  }

  if (!buffer) {
    throw new Error(`No se pudo descargar la bandera de ${countryCode} desde ninguna URL`);
  }

  return sharp(buffer)
    .resize(size, size, { fit: 'contain', background: { r: 28, g: 25, b: 23, alpha: 1 } })
    .webp({ quality: 85 })
    .toBuffer();
}

/**
 * Genera una imagen de color (rectangulo redondeado sobre fondo oscuro).
 */
async function generateColorSwatch(color, bgColor, size) {
  const padding = Math.round(size * 0.15);
  const innerSize = size - padding * 2;
  const radius = Math.round(innerSize * 0.15);

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${bgColor}" rx="24"/>
      <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}"
            fill="${color}" rx="${radius}" ry="${radius}"/>
      <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}"
            fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"
            rx="${radius}" ry="${radius}"/>
    </svg>`;

  return sharp(Buffer.from(svg)).resize(size, size).webp({ quality: 85 }).toBuffer();
}

/**
 * Genera una imagen de numero estilizado.
 */
async function generateNumberImage(number, color, bgColor, size) {
  const fontSize = Math.round(size * 0.55);

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f0f0f;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#bg)" rx="24"/>
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif" font-weight="bold"
            font-size="${fontSize}" fill="${color}"
            stroke="rgba(0,0,0,0.3)" stroke-width="2">${number}</text>
    </svg>`;

  return sharp(Buffer.from(svg)).resize(size, size).webp({ quality: 85 }).toBuffer();
}

/**
 * Genera una imagen de forma geometrica SVG.
 */
async function generateShapeImage(shape, color, bgColor, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  const shapes = {
    circle: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>`,
    square: `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${color}" rx="12" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>`,
    triangle: (() => {
      const h = r * Math.sqrt(3);
      return `<polygon points="${cx},${cy - r} ${cx - h / 2},${cy + r * 0.5} ${cx + h / 2},${cy + r * 0.5}" fill="${color}" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>`;
    })(),
    star: (() => {
      const points = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 2) * -1 + (Math.PI / 5) * i;
        const rad = i % 2 === 0 ? r : r * 0.45;
        points.push(`${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`);
      }
      return `<polygon points="${points.join(' ')}" fill="${color}" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>`;
    })(),
    heart: `<path d="M ${cx} ${cy + r * 0.7} C ${cx - r * 1.2} ${cy - r * 0.1} ${cx - r * 0.6} ${cy - r} ${cx} ${cy - r * 0.4} C ${cx + r * 0.6} ${cy - r} ${cx + r * 1.2} ${cy - r * 0.1} ${cx} ${cy + r * 0.7} Z" fill="${color}" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>`,
    diamond: (() =>
      `<polygon points="${cx},${cy - r} ${cx + r * 0.65},${cy} ${cx},${cy + r} ${cx - r * 0.65},${cy}" fill="${color}" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>`)()
  };

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${bgColor}" rx="24"/>
      ${shapes[shape]}
    </svg>`;

  return sharp(Buffer.from(svg)).resize(size, size).webp({ quality: 85 }).toBuffer();
}

/**
 * Descarga un emoji Twemoji SVG y lo compone sobre un fondo oscuro con bordes redondeados.
 * Fuente: Twemoji de Twitter (CC-BY 4.0), servido via jsDelivr CDN.
 */
async function generateTwemojiImage(codepoint, bgColor, size) {
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoint}.svg`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error descargando Twemoji ${codepoint}: ${response.status}`);
  }
  const svgBuffer = Buffer.from(await response.arrayBuffer());

  // Redimensionar el emoji al 65% del tamano total, centrado
  const emojiSize = Math.round(size * 0.65);
  const emojiBuffer = await sharp(svgBuffer).resize(emojiSize, emojiSize).png().toBuffer();

  // Crear fondo oscuro con bordes redondeados
  const bgSvg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${bgColor}" rx="24"/>
    </svg>`;
  const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  // Componer emoji centrado sobre el fondo
  const offset = Math.round((size - emojiSize) / 2);
  return sharp(bgBuffer)
    .composite([{ input: emojiBuffer, left: offset, top: offset }])
    .webp({ quality: 85 })
    .toBuffer();
}

// ── Generador principal ─────────────────────────────────────────────────────

/**
 * Genera el buffer WebP de un asset segun su metodo.
 */
async function generateAssetImage(contextConfig, asset, size) {
  switch (contextConfig.method) {
    case 'flags':
      return generateFlagImage(asset.code, size);
    case 'color-swatch':
      return generateColorSwatch(asset.color, asset.bgColor, size);
    case 'number':
      return generateNumberImage(asset.number, asset.color, asset.bgColor, size);
    case 'shape':
      return generateShapeImage(asset.shape, asset.color, asset.bgColor, size);
    case 'twemoji':
      return generateTwemojiImage(asset.codepoint, asset.bgColor, size);
    default:
      throw new Error(`Metodo desconocido: ${contextConfig.method}`);
  }
}

// ── Subida a Supabase ───────────────────────────────────────────────────────

/**
 * Sube un buffer a Supabase Storage con upsert.
 * @returns {string} URL publica del archivo
 */
async function uploadToStorage(filePath, buffer) {
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, buffer, {
    contentType: 'image/webp',
    upsert: true
  });

  if (error) {
    throw new Error(`Error subiendo ${filePath}: ${error.message}`);
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  return publicUrl;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Seed Storage Assets ===\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`URL: ${SUPABASE_URL}\n`);

  let totalUploaded = 0;
  let totalErrors = 0;
  const urlMap = {};

  for (const [contextId, config] of Object.entries(CONTEXT_ASSETS)) {
    console.log(`\n📦 Contexto: ${contextId} (${config.method})`);
    urlMap[contextId] = {};

    for (const asset of config.assets) {
      try {
        // Generar imagen principal (512x512)
        const mainBuffer = await generateAssetImage(config, asset, MAIN_SIZE);
        const mainPath = `ctx-${contextId}/image/${asset.key}.webp`;
        const mainUrl = await uploadToStorage(mainPath, mainBuffer);

        // Generar thumbnail (256x256)
        const thumbBuffer = await generateAssetImage(config, asset, THUMB_SIZE);
        const thumbPath = `ctx-${contextId}/thumbnail/${asset.key}_thumb.webp`;
        const thumbUrl = await uploadToStorage(thumbPath, thumbBuffer);

        urlMap[contextId][asset.key] = { imageUrl: mainUrl, thumbnailUrl: thumbUrl };
        totalUploaded += 2;
        console.log(`  ✅ ${asset.key}: image + thumbnail`);
      } catch (err) {
        totalErrors++;
        console.error(`  ❌ ${asset.key}: ${err.message}`);
      }
    }
  }

  console.log('\n=== Resumen ===');
  console.log(`Archivos subidos: ${totalUploaded}`);
  console.log(`Errores: ${totalErrors}`);

  if (totalErrors === 0) {
    console.log('\n✅ Todas las imagenes seed fueron subidas exitosamente.');
  } else {
    console.log('\n⚠️  Algunas imagenes fallaron. Revisa los errores arriba.');
  }

  // Imprimir URLs para referencia
  console.log('\n=== URLs generadas (para verificacion) ===');
  for (const [contextId, assets] of Object.entries(urlMap)) {
    console.log(`\n${contextId}:`);
    for (const [key, urls] of Object.entries(assets)) {
      console.log(`  ${key}:`);
      console.log(`    image: ${urls.imageUrl}`);
      console.log(`    thumb: ${urls.thumbnailUrl}`);
    }
  }
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
