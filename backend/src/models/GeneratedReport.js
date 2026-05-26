/**
 * @fileoverview Modelo de informes generados persistidos (T-942 Fase B).
 *
 * Cada vez que un docente genera un informe en `ReportGenerator`, el payload
 * completo se persiste para permitir "Reabrir" sin re-generar y para
 * alimentar el widget "Informes recientes" del tab de Insights.
 *
 * Estrategia de retención:
 * - **TTL Mongo 30 días** sobre `generatedAt` (auto-cleanup, sin job
 *   externo) — los informes envejecen rápido porque dependen de partidas
 *   nuevas, no tiene sentido conservarlos eternamente.
 * - **Cap 100 por docente** vía hook pre-save: si al insertar el docente
 *   alcanzaría 101, se borra el más antiguo (drop-oldest). Protege contra
 *   docentes que generen muchos informes en ráfaga (no infla M0 Atlas).
 *
 * `payload` es `Mixed` porque el contenido depende del `reportType` y del
 * `format`, y reproducir el esquema completo aquí lo acoplaría con la
 * estructura interna de `reportDataService`. `payloadSize` (bytes) se
 * recalcula al guardar para que sea posible auditar el coste de
 * almacenamiento.
 *
 * @module models/GeneratedReport
 */

const mongoose = require('mongoose');

const GeneratedReportMetadataSchema = new mongoose.Schema(
  {
    contextIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GameContext' }],
    mechanicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GameMechanic' }]
  },
  { _id: false }
);

const GeneratedReportSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El docente propietario es obligatorio'],
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
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
    },
    templateKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: [50, 'La clave de plantilla no puede exceder 50 caracteres']
    },
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [200, 'El título no puede exceder 200 caracteres']
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'El contenido del informe es obligatorio']
    },
    payloadSize: {
      type: Number,
      required: true,
      min: 0
    },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now
      // NOTA: el índice de generatedAt se declara abajo con `expireAfterSeconds`
      // (TTL). Mantenerlo aquí con `index: true` provoca un conflicto en Mongo
      // (mismo nombre, opciones diferentes) y duplica la definición en Mongoose.
    },
    metadata: {
      type: GeneratedReportMetadataSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true,
    collection: 'generated_reports',
    minimize: false
  }
);

// TTL: cleanup automático a 30 días (sin job externo).
GeneratedReportSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

// Índice para el listado paginado del docente (ordenado por generatedAt desc).
GeneratedReportSchema.index({ teacherId: 1, generatedAt: -1 });

/**
 * Tope de informes persistidos por docente. Más allá de esto se sacrifica
 * el más antiguo en el siguiente guardado (drop-oldest).
 */
const MAX_REPORTS_PER_TEACHER = 100;

/**
 * Hook pre-save: enforce cap de 100 informes/teacher y recalcula
 * `payloadSize` cuando el payload cambia. El cap aplica solo en
 * inserciones (`isNew`) porque updates no varían el conteo.
 */
GeneratedReportSchema.pre('save', async function preSaveGeneratedReport() {
  if (this.isModified('payload') || this.isNew) {
    this.payloadSize = Buffer.byteLength(JSON.stringify(this.payload ?? null), 'utf8');
  }

  if (!this.isNew) {
    return;
  }

  const Model = this.constructor;
  const count = await Model.countDocuments({ teacherId: this.teacherId });
  if (count >= MAX_REPORTS_PER_TEACHER) {
    const toDelete = count - MAX_REPORTS_PER_TEACHER + 1;
    // `.lean()` evita hidratar documentos Mongoose cuando solo necesitamos
    // los `_id` para el `deleteMany`. Lo activamos aunque la lista esté
    // acotada por `limit(toDelete)` porque el payload viaja en el hot path
    // de cualquier guardado de informe que satura el cap (drop-oldest).
    const oldest = await Model.find({ teacherId: this.teacherId })
      .sort({ generatedAt: 1 })
      .limit(toDelete)
      .select('_id')
      .lean();
    if (oldest.length > 0) {
      await Model.deleteMany({ _id: { $in: oldest.map(o => o._id) } });
    }
  }
});

module.exports = mongoose.model('GeneratedReport', GeneratedReportSchema);
module.exports.MAX_REPORTS_PER_TEACHER = MAX_REPORTS_PER_TEACHER;
