/**
 * Seeds the database with realistic demo data for all dashboards.
 *
 * Run:  node scripts/seedDemoData.js
 *
 * Idempotent-ish: drops demo data markers and re-inserts. Does NOT touch
 * the super admin or audit chain — those are separate concerns.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Facility = require('../models/Facility');
const Patient = require('../models/Patient');
const Encounter = require('../models/Encounter');
const MedicalHistory = require('../models/MedicalHistory');
const LabResult = require('../models/LabResult');
const InventoryItem = require('../models/InventoryItem');
const StockBatch = require('../models/StockBatch');
const StockTransaction = require('../models/StockTransaction');
const { generateMrn } = require('../services/mrnService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------
const FACILITIES = [
  {
    name: 'Connaught Hospital',
    code: 'SL-WA-CONNAUGHT',
    district: 'Western Area Urban',
    chiefdom: 'Freetown',
    type: 'national_referral',
    location: { latitude: 8.484, longitude: -13.228 },
  },
  {
    name: 'Bo Government Hospital',
    code: 'SL-BO-GOVHOSP',
    district: 'Bo',
    chiefdom: 'Kakua',
    type: 'regional',
    location: { latitude: 7.964, longitude: -11.738 },
  },
  {
    name: 'Kenema Government Hospital',
    code: 'SL-KE-GOVHOSP',
    district: 'Kenema',
    chiefdom: 'Nongowa',
    type: 'district',
    location: { latitude: 7.877, longitude: -11.190 },
  },
];

const STAFF_PER_FACILITY = [
  { fullName: 'Admin User', role: 'facility_admin' },
  { fullName: 'Dr. Mohamed Kamara', role: 'doctor' },
  { fullName: 'Nurse Isata Sesay', role: 'nurse' },
  { fullName: 'Pharm. Alhaji Bangura', role: 'pharmacist' },
  { fullName: 'Store Officer Mariama Conteh', role: 'store_officer' },
];

const PATIENTS_DATA = [
  { fullName: 'Aminata Koroma', sex: 'female', dob: '1985-03-15', district: 'Western Area Urban', phone: '076123456' },
  { fullName: 'Ibrahim Sesay', sex: 'male', dob: '1972-07-22', district: 'Western Area Urban', phone: '077234567' },
  { fullName: 'Fatmata Kamara', sex: 'female', dob: '1990-11-08', district: 'Bo', phone: '078345678' },
  { fullName: 'Mohamed Bangura', sex: 'male', dob: '1968-01-30', district: 'Bo', phone: '079456789' },
  { fullName: 'Mariama Conteh', sex: 'female', dob: '1995-06-12', district: 'Kenema', phone: '076567890' },
  { fullName: 'Alhaji Turay', sex: 'male', dob: '1980-09-25', district: 'Kenema', phone: '077678901' },
  { fullName: 'Isatu Mansaray', sex: 'female', dob: '1988-04-03', district: 'Western Area Urban', phone: '078789012' },
  { fullName: 'Abubakarr Jalloh', sex: 'male', dob: '1975-12-18', district: 'Bo', phone: '079890123' },
  { fullName: 'Kadiatu Bah', sex: 'female', dob: '1992-08-07', district: 'Kenema', phone: '076901234' },
  { fullName: 'Sorie Kanu', sex: 'male', dob: '1965-02-14', district: 'Western Area Urban', phone: '077012345' },
  { fullName: 'Hawa Koroma', sex: 'female', dob: '1998-10-20', district: 'Bo', phone: '078123456' },
  { fullName: 'Lansana Kamara', sex: 'male', dob: '2000-05-05', district: 'Kenema', phone: '079234567' },
  { fullName: 'Adama Sesay', sex: 'female', dob: '1987-01-11', district: 'Western Area Urban', phone: '076345678' },
  { fullName: 'Foday Bangura', sex: 'male', dob: '1978-07-29', district: 'Bo', phone: '077456789' },
  { fullName: 'Zainab Turay', sex: 'female', dob: '1993-03-16', district: 'Kenema', phone: '078567890' },
  { fullName: 'Saidu Mansaray', sex: 'male', dob: '1970-11-02', district: 'Western Area Urban', phone: '079678901' },
  { fullName: 'Kumba Jalloh', sex: 'female', dob: '2002-09-08', district: 'Bo', phone: '076789012' },
  { fullName: 'Abdul Bah', sex: 'male', dob: '1983-06-24', district: 'Kenema', phone: '077890123' },
  { fullName: 'Mabinty Kanu', sex: 'female', dob: '1996-12-30', district: 'Western Area Urban', phone: '078901234' },
  { fullName: 'Tamba Stevens', sex: 'male', dob: '1960-04-17', district: 'Bo', phone: '079012345' },
];

const INVENTORY_ITEMS = [
  { name: 'Amoxicillin 500mg', category: 'drug', drugClass: 'penicillin', unit: 'capsule', defaultReorderThreshold: 100 },
  { name: 'Paracetamol 500mg', category: 'drug', drugClass: 'analgesic', unit: 'tablet', defaultReorderThreshold: 200 },
  { name: 'Metformin 500mg', category: 'drug', drugClass: 'biguanide', unit: 'tablet', defaultReorderThreshold: 150 },
  { name: 'Artemether-Lumefantrine', category: 'drug', drugClass: 'antimalarial', unit: 'pack', defaultReorderThreshold: 80 },
  { name: 'ORS Sachets', category: 'consumable', unit: 'sachet', defaultReorderThreshold: 50 },
  { name: 'Surgical Gloves (Box)', category: 'consumable', unit: 'box', defaultReorderThreshold: 20 },
  { name: 'Rapid Malaria Test Kits', category: 'reagent', unit: 'kit', defaultReorderThreshold: 30 },
  { name: 'IV Normal Saline 0.9%', category: 'consumable', unit: 'bag', defaultReorderThreshold: 40 },
  { name: 'Ciprofloxacin 500mg', category: 'drug', drugClass: 'fluoroquinolone', unit: 'tablet', defaultReorderThreshold: 80 },
  { name: 'Diazepam 5mg', category: 'drug', drugClass: 'benzodiazepine', unit: 'tablet', defaultReorderThreshold: 30, isControlledSubstance: true },
];

const NOTIFIABLE_DIAGNOSES = [
  { description: 'Malaria (Plasmodium falciparum)', icd10Code: 'B50.9', isNotifiableDisease: true, isPrimary: true },
  { description: 'Cholera', icd10Code: 'A00.9', isNotifiableDisease: true, isPrimary: true },
  { description: 'Lassa Fever (suspected)', icd10Code: 'A96.2', isNotifiableDisease: true, isPrimary: true },
  { description: 'Measles', icd10Code: 'B05.9', isNotifiableDisease: true, isPrimary: true },
  { description: 'Tuberculosis (pulmonary)', icd10Code: 'A15.0', isNotifiableDisease: true, isPrimary: true },
];

const ROUTINE_DIAGNOSES = [
  { description: 'Upper respiratory tract infection', icd10Code: 'J06.9', isPrimary: true },
  { description: 'Hypertension, essential', icd10Code: 'I10', isPrimary: true },
  { description: 'Type 2 Diabetes Mellitus', icd10Code: 'E11', isPrimary: true },
  { description: 'Acute gastroenteritis', icd10Code: 'A09', isPrimary: true },
  { description: 'Urinary tract infection', icd10Code: 'N39.0', isPrimary: true },
  { description: 'Iron deficiency anaemia', icd10Code: 'D50.9', isPrimary: true },
  { description: 'Lower back pain', icd10Code: 'M54.5', isPrimary: true },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------
async function seed() {
  await connectDB();
  const superAdmin = await User.findOne({ role: 'moh_super_admin' });
  if (!superAdmin) {
    console.error('[seed-demo] No super admin found — run npm run seed:superadmin first.');
    process.exit(1);
  }
  const creatorId = superAdmin._id;

  console.log('[seed-demo] Clearing previous demo data...');
  // Use collection.drop() to bypass Mongoose middleware hooks on immutable models
  const db = mongoose.connection.db;
  const collections = ['stocktransactions', 'stockbatches', 'labresults', 'medicalhistories',
    'encounters', 'patients', 'inventoryitems', 'counters'];
  for (const name of collections) {
    try { await db.collection(name).drop(); } catch (e) { /* collection may not exist */ }
  }
  await User.deleteMany({ role: { $ne: 'moh_super_admin' } });
  await Facility.deleteMany({});

  // -----------------------------------------------------------------------
  // 1. Facilities
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating facilities...');
  const facilities = [];
  for (const fd of FACILITIES) {
    const f = await Facility.create({ ...fd, createdBy: creatorId });
    facilities.push(f);
  }

  // -----------------------------------------------------------------------
  // 2. Staff per facility
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating staff accounts...');
  const staffByFacility = {}; // facilityId -> { role -> User }
  for (const facility of facilities) {
    staffByFacility[facility._id] = {};
    for (const sd of STAFF_PER_FACILITY) {
      const suffix = facility.code.toLowerCase().replace(/-/g, '_');
      const username = `${sd.fullName.split(' ').pop().toLowerCase()}.${suffix}`;
      const user = new User({
        facilityId: facility._id,
        role: sd.role,
        fullName: `${sd.fullName} (${facility.name.split(' ')[0]})`,
        username,
        mustChangePassword: false,
        createdBy: creatorId,
      });
      await user.setPassword('DemoPassword1!');
      await user.save();
      staffByFacility[facility._id][sd.role] = user;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Inventory items
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating inventory items...');
  const items = [];
  for (const id of INVENTORY_ITEMS) {
    const item = await InventoryItem.create({ ...id, createdBy: creatorId });
    items.push(item);
  }

  // -----------------------------------------------------------------------
  // 4. Stock batches per facility
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating stock batches...');
  const batchesByFacilityItem = {}; // `${facilityId}_${itemId}` -> StockBatch
  for (const facility of facilities) {
    const storeOfficer = staffByFacility[facility._id]['store_officer'] || staffByFacility[facility._id]['facility_admin'];
    for (const item of items) {
      const key = `${facility._id}_${item._id}`;
      // Vary quantities: first facility gets more, last gets less (creates contrast)
      const facilityIdx = facilities.indexOf(facility);
      const baseQty = item.defaultReorderThreshold * (3 - facilityIdx);
      const qty = Math.max(5, baseQty + Math.floor(Math.random() * 50) - 25);

      const batch = await StockBatch.create({
        facilityId: facility._id,
        inventoryItemId: item._id,
        batchNumber: `BATCH-${facility.code}-${item.name.substring(0, 3).toUpperCase()}-001`,
        expiryDate: daysFromNow(180 + Math.floor(Math.random() * 365)),
        quantityReceived: qty,
        quantityRemaining: qty,
        supplier: pick(['UNICEF Supply Div.', 'National Pharma', 'MedSource West Africa', 'Crown Agents']),
        receivedBy: storeOfficer._id,
        receivedAt: daysAgo(30 + Math.floor(Math.random() * 60)),
      });
      batchesByFacilityItem[key] = batch;

      // Create receipt transaction
      await StockTransaction.create({
        type: 'receipt',
        facilityId: facility._id,
        inventoryItemId: item._id,
        batchId: batch._id,
        quantity: qty,
        performedBy: storeOfficer._id,
        performedAt: batch.receivedAt,
      });
    }
  }

  // Add a nearly-expired batch at the last facility to trigger expiry alerts
  const expiringBatch = await StockBatch.create({
    facilityId: facilities[2]._id,
    inventoryItemId: items[0]._id,
    batchNumber: 'BATCH-EXPIRING-SOON',
    expiryDate: daysFromNow(12),
    quantityReceived: 50,
    quantityRemaining: 35,
    supplier: 'UNICEF Supply Div.',
    receivedBy: staffByFacility[facilities[2]._id]['store_officer']._id,
    receivedAt: daysAgo(150),
  });

  // Make a low-stock scenario at facility 3 for a couple items
  for (let i = 0; i < 3; i++) {
    const key = `${facilities[2]._id}_${items[i]._id}`;
    const batch = batchesByFacilityItem[key];
    if (batch) {
      batch.quantityRemaining = Math.min(batch.quantityRemaining, Math.floor(items[i].defaultReorderThreshold * 0.3));
      await batch.save();
    }
  }

  // -----------------------------------------------------------------------
  // 5. Patients — spread across facilities
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating patients...');
  const patients = [];
  for (let i = 0; i < PATIENTS_DATA.length; i++) {
    const pd = PATIENTS_DATA[i];
    const facility = facilities[i % facilities.length];
    const doctor = staffByFacility[facility._id]['doctor'];
    const mrn = await generateMrn();

    const patient = await Patient.create({
      mrn,
      identityTier: i < 15 ? 'verified' : 'provisional',
      nationalId: i < 15 ? `NID-${String(i + 1).padStart(6, '0')}` : undefined,
      fullName: pd.fullName,
      dateOfBirth: new Date(pd.dob),
      sex: pd.sex,
      phone: pd.phone,
      district: pd.district,
      registeredAtFacility: facility._id,
      registeredBy: doctor._id,
      consent: { dataSharingWithMoH: true, recordedAt: daysAgo(10), recordedBy: doctor._id },
      allergies: i % 5 === 0 ? [{
        substance: 'Penicillin',
        reaction: 'Rash',
        severity: 'moderate',
        recordedBy: doctor._id,
      }] : [],
      chronicConditions: i % 4 === 0 ? [{
        condition: pick(['Hypertension', 'Type 2 Diabetes', 'Asthma', 'Sickle Cell Disease']),
        status: 'active',
        diagnosedAt: daysAgo(365),
      }] : [],
    });
    patients.push(patient);
  }

  // -----------------------------------------------------------------------
  // 6. Encounters — mix of open/closed, routine and notifiable
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating encounters...');
  const encounters = [];
  for (let i = 0; i < patients.length; i++) {
    const patient = patients[i];
    const facility = facilities[i % facilities.length];
    const doctor = staffByFacility[facility._id]['doctor'];

    // Each patient gets 1-3 encounters
    const numEncounters = 1 + Math.floor(Math.random() * 3);
    for (let e = 0; e < numEncounters; e++) {
      const isNotifiable = Math.random() < 0.25;
      const diagnosis = isNotifiable
        ? [pick(NOTIFIABLE_DIAGNOSES)]
        : [pick(ROUTINE_DIAGNOSES)];
      const isOpen = e === 0 && Math.random() < 0.4;

      const enc = await Encounter.create({
        patientId: patient._id,
        facilityId: facility._id,
        type: pick(['outpatient', 'inpatient_admission', 'emergency', 'antenatal']),
        attendingProviderId: doctor._id,
        chiefComplaint: pick([
          'Fever and body aches for 3 days',
          'Persistent cough for 2 weeks',
          'Abdominal pain and diarrhea',
          'Headache and dizziness',
          'Routine checkup',
          'Follow-up visit',
          'Difficulty breathing',
          'Wound care',
        ]),
        vitals: {
          temperatureC: 36 + Math.random() * 3,
          bloodPressureSystolic: 100 + Math.floor(Math.random() * 60),
          bloodPressureDiastolic: 60 + Math.floor(Math.random() * 40),
          heartRateBpm: 60 + Math.floor(Math.random() * 40),
          respiratoryRate: 14 + Math.floor(Math.random() * 12),
          oxygenSaturation: 93 + Math.floor(Math.random() * 7),
          weightKg: 45 + Math.floor(Math.random() * 50),
          heightCm: 150 + Math.floor(Math.random() * 35),
          recordedAt: daysAgo(e * 10 + Math.floor(Math.random() * 5)),
        },
        diagnosis,
        notes: 'Demo encounter — clinical notes would appear here.',
        status: isOpen ? 'open' : 'closed',
        admittedAt: daysAgo(e * 10 + Math.floor(Math.random() * 10)),
        dischargedAt: isOpen ? undefined : daysAgo(e * 10),
      });
      encounters.push(enc);
    }
  }

  // -----------------------------------------------------------------------
  // 7. Prescriptions (MedicalHistory entries)
  // -----------------------------------------------------------------------
  console.log('[seed-demo] Creating prescriptions...');
  const prescriptions = [];
  for (let i = 0; i < encounters.length; i++) {
    const enc = encounters[i];
    if (Math.random() < 0.3) continue; // not every encounter has a prescription
    const facility = facilities.find(f => f._id.equals(enc.facilityId));
    const doctor = staffByFacility[facility._id]['doctor'];
    const item = pick(items.filter(it => it.category === 'drug'));

    const qtyPrescribed = 10 + Math.floor(Math.random() * 50);
    const dispensed = Math.random() < 0.6;

    const mh = await MedicalHistory.create({
      patientId: enc.patientId,
      encounterId: enc._id,
      facilityId: facility._id,
      entryType: 'prescription',
      prescription: {
        inventoryItemId: item._id,
        drugName: item.name,
        dosage: pick(['250mg', '500mg', '1g']),
        frequency: pick(['Once daily', 'Twice daily', '3x daily', 'Every 8 hours']),
        durationDays: pick([3, 5, 7, 14]),
        route: pick(['oral', 'iv', 'im']),
        allergyCheckPerformed: true,
        dispenseStatus: dispensed ? 'dispensed' : 'pending',
        quantityPrescribed: qtyPrescribed,
        quantityDispensed: dispensed ? qtyPrescribed : 0,
      },
      prescribedBy: doctor._id,
    });
    prescriptions.push(mh);

    // Simulate dispense: deduct from stock
    if (dispensed) {
      const key = `${facility._id}_${item._id}`;
      const batch = batchesByFacilityItem[key];
      if (batch && batch.quantityRemaining > qtyPrescribed) {
        batch.quantityRemaining -= qtyPrescribed;
        await batch.save();

        await StockTransaction.create({
          type: 'dispense',
          facilityId: facility._id,
          inventoryItemId: item._id,
          batchId: batch._id,
          quantity: qtyPrescribed,
          dispensedForPatientId: enc.patientId,
          dispensedForMedicalHistoryId: mh._id,
          performedBy: staffByFacility[facility._id]['pharmacist']._id,
          performedAt: daysAgo(Math.floor(Math.random() * 20)),
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // 8. Summary
  // -----------------------------------------------------------------------
  console.log('\n[seed-demo] ✅ Demo data seeded successfully!');
  console.log(`  Facilities:     ${facilities.length}`);
  console.log(`  Staff accounts: ${facilities.length * STAFF_PER_FACILITY.length}`);
  console.log(`  Patients:       ${patients.length}`);
  console.log(`  Encounters:     ${encounters.length}`);
  console.log(`  Prescriptions:  ${prescriptions.length}`);
  console.log(`  Inventory items: ${items.length}`);
  console.log(`  Stock batches:   ${facilities.length * items.length + 1}`);
  console.log('\n  Staff login (any facility): password "DemoPassword1!"');
  console.log('  Example usernames:');
  for (const facility of facilities) {
    const admin = staffByFacility[facility._id]['facility_admin'];
    const doctor = staffByFacility[facility._id]['doctor'];
    console.log(`    ${facility.name}:`);
    console.log(`      Admin:  ${admin.username}`);
    console.log(`      Doctor: ${doctor.username}`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed-demo] Failed:', err);
  process.exit(1);
});

