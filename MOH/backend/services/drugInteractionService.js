const {
  CROSS_ALLERGY_GROUPS,
  KNOWN_INTERACTIONS,
  classesForDrug,
  normalizeDrugName,
} = require('../constants/drugReference');

/**
 * Checks a proposed drug against a patient's recorded allergies. Two
 * tiers, in order of confidence:
 *  1. Direct substance match (substring, either direction) — unchanged
 *     from the original implementation, still the most reliable signal
 *     since it's exactly what was recorded as the allergy.
 *  2. Class-level cross-reactivity — NEW: catches the case substring
 *     matching structurally cannot, e.g. a patient allergic to
 *     "penicillin" being prescribed "amoxicillin" (a different word
 *     entirely, same drug class). Only fires for classes in
 *     CROSS_ALLERGY_GROUPS, which is a deliberately short, well-
 *     established list — not every same-class pair implies real
 *     cross-allergy risk.
 *
 * Returns the matching allergy entry plus which check tier caught it, or
 * null if no conflict. Checks ALL allergies and returns the first match;
 * callers needing every conflict should filter patient.allergies
 * separately.
 */
function checkAllergyConflict(patient, drugName) {
  if (!drugName || !patient.allergies?.length) return null;
  const drugNormalized = normalizeDrugName(drugName);
  const drugClasses = classesForDrug(drugName);

  for (const allergy of patient.allergies) {
    const allergyNormalized = normalizeDrugName(allergy.substance);

    // Tier 1: direct substring match, either direction.
    if (drugNormalized.includes(allergyNormalized) || allergyNormalized.includes(drugNormalized)) {
      return { allergy, matchType: 'direct' };
    }

    // Tier 2: class-level cross-reactivity.
    const allergyClasses = classesForDrug(allergy.substance);
    for (const group of CROSS_ALLERGY_GROUPS) {
      const drugInGroup = drugClasses.some((c) => group.includes(c));
      const allergyInGroup = allergyClasses.some((c) => group.includes(c));
      if (drugInGroup && allergyInGroup) {
        return { allergy, matchType: 'cross_reactivity', group };
      }
    }
  }

  return null;
}

/**
 * Checks a proposed drug against a list of the patient's other active
 * medications for known class-pair interactions. `activeDrugNames` should
 * be the drugName strings of the patient's current, non-discontinued
 * prescriptions (callers decide what "active" means — see
 * routes/medicalHistory.js for how this is sourced from MedicalHistory).
 *
 * Returns an array (possibly empty) of { withDrug, severity, description }
 * — a patient can have more than one simultaneous interaction, unlike the
 * allergy check which stops at the first match.
 */
function checkDrugInteractions(newDrugName, activeDrugNames = []) {
  if (!newDrugName || !activeDrugNames.length) return [];

  const newDrugClasses = classesForDrug(newDrugName);
  if (newDrugClasses.length === 0) return [];

  const results = [];

  for (const existingDrugName of activeDrugNames) {
    if (normalizeDrugName(existingDrugName) === normalizeDrugName(newDrugName)) continue; // same drug, not an interaction
    const existingClasses = classesForDrug(existingDrugName);
    if (existingClasses.length === 0) continue;

    for (const rule of KNOWN_INTERACTIONS) {
      const newMatchesA = newDrugClasses.includes(rule.classA);
      const newMatchesB = newDrugClasses.includes(rule.classB);
      const existingMatchesA = existingClasses.includes(rule.classA);
      const existingMatchesB = existingClasses.includes(rule.classB);

      // A class pair rule fires regardless of which drug matches which
      // side — (new=A, existing=B) or (new=B, existing=A) are both valid.
      if ((newMatchesA && existingMatchesB) || (newMatchesB && existingMatchesA)) {
        results.push({
          withDrug: existingDrugName,
          severity: rule.severity,
          description: rule.description,
        });
      }
    }
  }

  return results;
}

module.exports = { checkAllergyConflict, checkDrugInteractions };
