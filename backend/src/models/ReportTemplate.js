/**
 * @fileoverview Modelo de plantillas de informes predefinidas (T-942 Fase B).
 *
 * Persiste las plantillas que rellenan los dropdowns del `ReportGenerator`
 * en un solo click. Hay tres plantillas `isSystem=true` (no editables) creadas
 * por el seeder y, opcionalmente, plantillas custom creadas por super_admin.
 *
 * Decisiones:
 * - `key` único e inmutable (lo usa el cliente para identificar la plantilla).
 * - `isSystem` separa las plantillas del seeder (no borrables) de las
 *   creadas por super_admin (borrables).
 * - Sin teacherId: las plantillas son del centro (compartidas entre docentes).
 *
 * @module models/ReportTemplate
 */

const mongoose = require('mongoose');

const ReportTemplateDefaultsSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: ['classroom', 'student'],
      required: [true, 'El tipo de informe es obligatorio']
    },
    period: {
      type: String,
      enum: ['7d', '30d', '90d'],
      required: [true, 'El período es obligatorio']
    },
    format: {
      type: String,
      enum: ['summary', 'detailed'],
      required: [true, 'El formato es obligatorio']
    }
  },
  { _id: false }
);

const ReportTemplateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'La clave de la plantilla es obligatoria'],
      unique: true,
      trim: true,
      maxlength: [50, 'La clave no puede exceder 50 caracteres']
    },
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      maxlength: [100, 'El nombre no puede exceder 100 caracteres']
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [280, 'La descripción no puede exceder 280 caracteres']
    },
    defaults: {
      type: ReportTemplateDefaultsSchema,
      required: [true, 'Los valores por defecto son obligatorios']
    },
    icon: {
      type: String,
      default: 'FileText',
      trim: true,
      maxlength: [40, 'El icono no puede exceder 40 caracteres']
    },
    isSystem: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    collection: 'report_templates'
  }
);

module.exports = mongoose.model('ReportTemplate', ReportTemplateSchema);
