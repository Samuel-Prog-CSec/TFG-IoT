const mongoose = require('mongoose');

const gameMechanicSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: String,
  icon: String,
  rules: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

gameMechanicSchema.index({ isActive: 1 });
gameMechanicSchema.index({ name: 1 });

module.exports = mongoose.model('GameMechanic', gameMechanicSchema);
