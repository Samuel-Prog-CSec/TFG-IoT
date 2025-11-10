const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  alias: { // Nombre amigable para identificar la tarjeta en el mundo real
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    uppercase: true,
    trim: true,
    enum: ['MIFARE 1KB', 'MIFARE 4KB', 'NTAG', 'UNKNOWN'],
    default: 'NTAG'
  },
  status: {
    type: String,
    lowercase: true,
    trim: true,
    enum: ['active', 'inactive', 'lost'],
    default: 'active'
  },
  metadata: {
    color: String,
    icon: String,
    lastUsed: Date
  }
}, {
  timestamps: true
});

/* Búsqueda por UID
   REDUNDANTE???
 */
cardSchema.index({ uid: 1 });

// Si el panel de administración lista las tarjetas por estado: active, inactive, lost (POR CONCRETAR)
cardSchema.index({ status: 1 });

// Update lastUsed timestamp
cardSchema.methods.updateLastUsed = function() {
  this.metadata.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('Card', cardSchema);
