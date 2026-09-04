const mongoose = require('mongoose');
const { Schema } = mongoose;

const inventoryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Amoxicillin 500mg"
    category: {
      type: String,
      enum: ['drug', 'consumable', 'equipment', 'reagent'],
      required: true,
    },
    drugClass: { type: String, trim: true }, // e.g. "penicillin" — groundwork for allergy cross-checking by class, not just name string
    unit: { type: String, required: true }, // e.g. "tablet", "vial", "box"

    // Reorder thresholds are defined at the catalog level as defaults; a
    // facility can override via StockLevel.reorderThreshold if needed.
    defaultReorderThreshold: { type: Number, default: 10 },

    isControlledSubstance: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'discontinued'], default: 'active' },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ name: 'text' });
inventoryItemSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
