/**
 * DRUG-CLASS REFERENCE TABLE
 * -----------------------------------------------------------------------
 * Backs allergy cross-reactivity and drug-drug interaction checking in
 * services/drugInteractionService.js. Scoped to drugs commonly seen on the
 * WHO Model List of Essential Medicines and a typical Sierra Leone
 * facility formulary (antimalarials, first-line antibiotics, antivirals
 * for HIV/TB, basic cardiovascular and analgesic drugs) — this is NOT an
 * exhaustive national or international drug database.
 *
 * IMPORTANT — WHAT THIS IS AND ISN'T:
 * This is clinical DECISION SUPPORT, not a diagnosis or prescribing
 * authority. It surfaces well-established, textbook-level
 * interaction/cross-allergy patterns (the same category of fact any
 * pharmacology reference or EHR interaction-checker encodes) so a
 * prescriber sees a flag before it becomes a mistake — it does not replace
 * clinical judgment, a maintained national formulary, or a real
 * pharmacist review. Coverage here is necessarily incomplete: a drug
 * absent from this table produces NO alert, which must never be read as
 * "this drug has been checked and is safe." Before any real deployment,
 * this table should be reviewed and maintained by a qualified pharmacist
 * against Sierra Leone's actual national formulary, and ideally replaced
 * or supplemented with a licensed, continuously-updated interaction
 * database (e.g., a Lexicomp/Micromedex/BNF integration) rather than
 * relied on as the sole source of truth long-term.
 *
 * Data structure:
 *  - DRUG_CLASSES: generic name (lowercase, normalized) -> array of class
 *    tags. A drug can belong to more than one class where relevant (e.g.
 *    co-trimoxazole is both a sulfonamide and a folate-antagonist).
 *  - BRAND_TO_GENERIC: common brand/alternate names seen on prescriptions
 *    -> the generic name key used in DRUG_CLASSES.
 *  - CROSS_ALLERGY_GROUPS: sets of classes where an allergy to one member
 *    implies meaningful cross-reactivity risk with the others.
 *  - KNOWN_INTERACTIONS: pairs of classes with a documented interaction,
 *    a severity tier, and a plain-language description.
 */

const DRUG_CLASSES = {
  // --- Antibiotics ---
  amoxicillin: ['penicillin'],
  ampicillin: ['penicillin'],
  'amoxicillin-clavulanate': ['penicillin'],
  penicillin: ['penicillin'],
  'benzathine penicillin': ['penicillin'],
  flucloxacillin: ['penicillin'],
  ceftriaxone: ['cephalosporin'],
  cefixime: ['cephalosporin'],
  cefuroxime: ['cephalosporin'],
  ciprofloxacin: ['fluoroquinolone'],
  levofloxacin: ['fluoroquinolone'],
  gentamicin: ['aminoglycoside'],
  amikacin: ['aminoglycoside'],
  erythromycin: ['macrolide', 'qt_prolonging'],
  azithromycin: ['macrolide', 'qt_prolonging'],
  doxycycline: ['tetracycline'],
  metronidazole: ['nitroimidazole'],
  'co-trimoxazole': ['sulfonamide', 'folate_antagonist'],
  'sulfamethoxazole-trimethoprim': ['sulfonamide', 'folate_antagonist'],
  rifampicin: ['rifamycin', 'cyp450_inducer'],
  isoniazid: ['antitubercular'],
  pyrazinamide: ['antitubercular'],
  ethambutol: ['antitubercular'],

  // --- Antimalarials ---
  'artemether-lumefantrine': ['antimalarial', 'qt_prolonging'],
  quinine: ['antimalarial', 'qt_prolonging'],
  'sulfadoxine-pyrimethamine': ['antimalarial', 'sulfonamide', 'folate_antagonist'],
  chloroquine: ['antimalarial', 'qt_prolonging'],

  // --- Analgesics / NSAIDs ---
  paracetamol: ['analgesic_nonopioid'],
  acetaminophen: ['analgesic_nonopioid'],
  ibuprofen: ['nsaid'],
  diclofenac: ['nsaid'],
  aspirin: ['nsaid', 'antiplatelet'],
  indomethacin: ['nsaid'],

  // --- Cardiovascular ---
  enalapril: ['ace_inhibitor'],
  lisinopril: ['ace_inhibitor'],
  captopril: ['ace_inhibitor'],
  losartan: ['arb'],
  amlodipine: ['calcium_channel_blocker'],
  furosemide: ['loop_diuretic'],
  hydrochlorothiazide: ['thiazide_diuretic'],
  spironolactone: ['potassium_sparing_diuretic'],
  warfarin: ['anticoagulant'],
  digoxin: ['cardiac_glycoside'],

  // --- Diabetes ---
  metformin: ['biguanide'],
  glibenclamide: ['sulfonylurea'],
  insulin: ['insulin'],

  // --- HIV / antiretrovirals (simplified — real ART interaction
  // checking is far more nuanced than class-pair rules can capture;
  // treat any ART regimen change as needing a pharmacist review
  // regardless of what this table does or doesn't flag) ---
  efavirenz: ['nnrti', 'cyp450_inducer'],
  nevirapine: ['nnrti', 'cyp450_inducer'],
  tenofovir: ['nrti'],
  lamivudine: ['nrti'],
  dolutegravir: ['integrase_inhibitor'],
};

const BRAND_TO_GENERIC = {
  augmentin: 'amoxicillin-clavulanate',
  panadol: 'paracetamol',
  tylenol: 'acetaminophen',
  brufen: 'ibuprofen',
  flagyl: 'metronidazole',
  septrin: 'co-trimoxazole',
  bactrim: 'sulfamethoxazole-trimethoprim',
  coartem: 'artemether-lumefantrine',
  lasix: 'furosemide',
  aldactone: 'spironolactone',
};

// Cross-reactivity risk groups — allergy to ANY member of a group is
// flagged against prescribing ANY OTHER member of that same group.
// Penicillin/cephalosporin cross-reactivity is real but lower than
// historically taught (roughly 1-2% in penicillin-allergic patients per
// modern estimates, not the ~10% older teaching suggested) — flagged as
// a caution, not an absolute contraindication; the prescriber's override
// path exists precisely for cases like this where clinical context
// should override a class-level flag.
const CROSS_ALLERGY_GROUPS = [
  ['penicillin', 'cephalosporin'],
  ['sulfonamide'], // co-trimoxazole, sulfadoxine-pyrimethamine, etc. — flagged against each other via substance/class match, not against unrelated classes
];

const SEVERITY = { MAJOR: 'major', MODERATE: 'moderate', MINOR: 'minor' };

const KNOWN_INTERACTIONS = [
  {
    classA: 'anticoagulant',
    classB: 'nsaid',
    severity: SEVERITY.MAJOR,
    description: 'Significantly increased bleeding risk — NSAIDs impair platelet function and can displace warfarin from protein binding.',
  },
  {
    classA: 'antiplatelet',
    classB: 'anticoagulant',
    severity: SEVERITY.MAJOR,
    description: 'Combined antiplatelet and anticoagulant therapy substantially raises bleeding risk.',
  },
  {
    classA: 'ace_inhibitor',
    classB: 'potassium_sparing_diuretic',
    severity: SEVERITY.MAJOR,
    description: 'Risk of hyperkalemia, especially with renal impairment — monitor serum potassium if combination is necessary.',
  },
  {
    classA: 'arb',
    classB: 'potassium_sparing_diuretic',
    severity: SEVERITY.MAJOR,
    description: 'Risk of hyperkalemia, especially with renal impairment — monitor serum potassium if combination is necessary.',
  },
  {
    classA: 'ace_inhibitor',
    classB: 'nsaid',
    severity: SEVERITY.MODERATE,
    description: 'NSAIDs can reduce the antihypertensive effect of ACE inhibitors and increase risk of acute kidney injury, particularly with volume depletion.',
  },
  {
    classA: 'aminoglycoside',
    classB: 'loop_diuretic',
    severity: SEVERITY.MAJOR,
    description: 'Increased risk of ototoxicity and nephrotoxicity when combined.',
  },
  {
    classA: 'nitroimidazole', // metronidazole
    classB: 'anticoagulant',
    severity: SEVERITY.MODERATE,
    description: 'Metronidazole can potentiate warfarin\u2019s effect — monitor INR closely if co-prescribed.',
  },
  {
    classA: 'macrolide',
    classB: 'qt_prolonging',
    severity: SEVERITY.MODERATE,
    description: 'Additive QT-prolongation risk — caution combining with other QT-prolonging agents (including some antimalarials).',
  },
  {
    classA: 'fluoroquinolone',
    classB: 'qt_prolonging',
    severity: SEVERITY.MODERATE,
    description: 'Additive QT-prolongation risk.',
  },
  {
    classA: 'rifamycin',
    classB: 'nnrti',
    severity: SEVERITY.MAJOR,
    description: 'Rifampicin strongly induces CYP450 metabolism and can significantly reduce efficacy of NNRTI-based ART — regimen review needed before co-prescribing.',
  },
  {
    classA: 'cyp450_inducer',
    classB: 'anticoagulant',
    severity: SEVERITY.MODERATE,
    description: 'CYP450 inducers (e.g. rifampicin) can reduce warfarin effect — INR monitoring needed if co-prescribed.',
  },
  {
    classA: 'sulfonylurea',
    classB: 'sulfonamide',
    severity: SEVERITY.MINOR,
    description: 'Sulfonamide antibiotics can potentiate the hypoglycemic effect of sulfonylureas — monitor blood glucose.',
  },
  {
    classA: 'digoxin',
    classB: 'loop_diuretic',
    severity: SEVERITY.MODERATE,
    description: 'Diuretic-induced hypokalemia increases risk of digoxin toxicity — monitor electrolytes.',
  },
];

function normalizeDrugName(name) {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  return BRAND_TO_GENERIC[lower] || lower;
}

function classesForDrug(name) {
  const normalized = normalizeDrugName(name);
  if (DRUG_CLASSES[normalized]) return DRUG_CLASSES[normalized];
  // Loose fallback: a normalized name that CONTAINS a known generic (e.g.
  // "amoxicillin 500mg capsule" typed as free text rather than picked from
  // a catalog) still resolves — but only as a substring match against
  // known keys, never the reverse, to avoid a short generic name (e.g.
  // "asa") accidentally matching inside an unrelated longer drug name.
  const match = Object.keys(DRUG_CLASSES).find((key) => normalized.includes(key));
  return match ? DRUG_CLASSES[match] : [];
}

module.exports = {
  DRUG_CLASSES,
  BRAND_TO_GENERIC,
  CROSS_ALLERGY_GROUPS,
  KNOWN_INTERACTIONS,
  SEVERITY,
  normalizeDrugName,
  classesForDrug,
};
