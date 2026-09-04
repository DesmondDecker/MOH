const mongoose = require('mongoose');
const { Schema } = mongoose;

const coldChainReadingSchema = new Schema(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: 'ColdChainDevice', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    temperatureC: { type: Number, required: true, min: -100, max: 100 },
    humidity: { type: Number, min: 0, max: 100 }, // percent, optional — not every sensor reports it

    recordedAt: { type: Date, required: true, default: Date.now }, // when the SENSOR took the reading
    receivedAt: { type: Date, required: true, default: Date.now }, // when this system ingested it — can lag recordedAt if the device was offline and is backfilling a queue

    doorOpenEvent: { type: Boolean, default: false }, // some sensors report door-open state alongside temperature
    source: { type: String, enum: ['sensor', 'manual'], default: 'sensor' }, // manual = a staff member logged a reading by hand during a sensor outage

    // Computed at ingestion time from the device's configured safe range
    // (ColdChainDevice.minSafeC/maxSafeC) and stored on the reading itself
    // — so a later change to a device's configured range doesn't rewrite
    // history, and a breach report reflects what was actually true when
    // the excursion happened.
    breached: { type: Boolean, default: false, index: true },
  },
  { timestamps: false }
);

coldChainReadingSchema.index({ deviceId: 1, recordedAt: -1 });
coldChainReadingSchema.index({ facilityId: 1, breached: 1, recordedAt: -1 });

module.exports = mongoose.model('ColdChainReading', coldChainReadingSchema);
