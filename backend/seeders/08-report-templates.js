/**
 * @fileoverview Seeder de plantillas de informes predefinidas (T-942 Fase B).
 *
 * Inserta (upsert por `key`) las plantillas del sistema que rellenan los
 * dropdowns del `ReportGenerator` con un click. Idempotente: ejecutar varias
 * veces no duplica y respeta cualquier ajuste de `name`/`description`/`icon`
 * que se haga aquí (el seeder es la fuente de verdad de las plantillas system).
 *
 * @module seeders/08-report-templates
 */

const ReportTemplate = require('../src/models/ReportTemplate');
const logger = require('../src/utils/logger');

/**
 * Plantillas del sistema (`isSystem: true`). No editables ni borrables desde la UI.
 */
const systemTemplates = [
  {
    key: 'end-of-term',
    name: 'Fin de trimestre',
    description: 'Resumen completo del trimestre para reuniones y archivos del aula.',
    icon: 'GraduationCap',
    defaults: {
      reportType: 'classroom',
      period: '90d',
      format: 'detailed'
    },
    isSystem: true
  },
  {
    key: 'parents',
    name: 'Para padres',
    description: 'Informe individual breve enfocado en el progreso del alumno.',
    icon: 'Users',
    defaults: {
      reportType: 'student',
      period: '30d',
      format: 'summary'
    },
    isSystem: true
  },
  {
    key: 'staff-meeting',
    name: 'Reunión de claustro',
    description: 'Datos agregados del aula listos para presentar al equipo docente.',
    icon: 'Building2',
    defaults: {
      reportType: 'classroom',
      period: '30d',
      format: 'summary'
    },
    isSystem: true
  }
];

/**
 * Ejecuta el seeder de plantillas de informe.
 *
 * Idempotente vía `findOneAndUpdate` con `upsert: true` sobre la clave única
 * `key`. Si el documento ya existe, se actualizan los campos enumerados
 * (refresca el seed con cualquier cambio editorial en el código).
 *
 * @returns {Promise<Array>} Plantillas resultantes (después del upsert)
 */
async function seedReportTemplates() {
  try {
    const results = [];
    for (const tpl of systemTemplates) {
      const doc = await ReportTemplate.findOneAndUpdate(
        { key: tpl.key },
        {
          $set: {
            name: tpl.name,
            description: tpl.description,
            icon: tpl.icon,
            defaults: tpl.defaults,
            isSystem: tpl.isSystem
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      results.push(doc);
    }

    logger.info(`Plantillas de informe seeded exitosamente (${results.length} plantillas system)`);
    return results;
  } catch (error) {
    logger.error('Error en seedReportTemplates:', error);
    throw error;
  }
}

module.exports = seedReportTemplates;
module.exports.systemTemplates = systemTemplates;
