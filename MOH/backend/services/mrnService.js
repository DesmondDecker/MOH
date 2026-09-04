const mongoose = require('mongoose');
const { Schema } = mongoose;

const counterSchema = new Schema({
  _id: { type: String }, // e.g. "mrn_2026"
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * Generates a unique, sequential MRN scoped by year: SL-2026-000123
 * Uses an atomic findOneAndUpdate increment so concurrent registrations
 * across facilities never collide.
 */
async function generateMrn() {
  const year = new Date().getFullYear();
  const counterId = `mrn_${year}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  const padded = String(counter.seq).padStart(6, '0');
  return `SL-${year}-${padded}`;
}

module.exports = { generateMrn };
