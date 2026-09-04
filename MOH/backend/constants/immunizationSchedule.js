/**
 * SIERRA LEONE EPI (EXPANDED PROGRAMME ON IMMUNIZATION) SCHEDULE
 * -----------------------------------------------------------------------
 * Core structure verified against a Sierra Leone-specific immunization
 * coverage study (Bombali/Tonkolili/Port Loko districts): a fully
 * immunized child receives BCG (1 dose), OPV (3 doses), pentavalent
 * vaccine (3 doses), and a measles-containing vaccine (1 dose), achievable
 * by 9 months of age under the national schedule. The dose-by-dose timing
 * below (6/10/14 weeks for the 3-dose series, 9 months for first measles
 * dose) follows the standard WHO/regional West African EPI pattern this
 * finding describes, cross-checked against neighboring countries'
 * published EPI schedules (Ghana, Malawi) for the same vaccines.
 *
 * WHAT THIS IS AND ISN'T: this schedule computes due/overdue FLAGS for
 * CHW and clinic workflows — it is not a substitute for Sierra Leone's
 * MoH EPI program's own current, authoritative schedule (which may
 * refine exact second-dose timing for measles/MR, add newer antigens like
 * malaria vaccine as national rollout expands, or adjust intervals). This
 * table should be reviewed and kept current against that source before
 * relying on it at national scale — flagged the same way the drug
 * reference table (constants/drugReference.js) and blood compatibility
 * table (constants/bloodCompatibility.js) are.
 */

// dueAtDays: age in days at which the dose becomes due. overdueAfterDays:
// how many days past due before it's flagged overdue rather than just
// upcoming (a grace window — real clinic access/travel means "due today"
// and "3 days late" shouldn't both read as equally urgent).
const IMMUNIZATION_SCHEDULE = [
  { vaccine: 'BCG', dose: 1, dueAtDays: 0, overdueAfterDays: 30, protectsAgainst: 'Tuberculosis' },
  { vaccine: 'OPV', dose: 0, dueAtDays: 0, overdueAfterDays: 14, protectsAgainst: 'Poliomyelitis' },
  { vaccine: 'Pentavalent', dose: 1, dueAtDays: 42, overdueAfterDays: 14, protectsAgainst: 'Diphtheria, pertussis, tetanus, Hepatitis B, Hib' },
  { vaccine: 'OPV', dose: 1, dueAtDays: 42, overdueAfterDays: 14, protectsAgainst: 'Poliomyelitis' },
  { vaccine: 'PCV', dose: 1, dueAtDays: 42, overdueAfterDays: 14, protectsAgainst: 'Pneumococcal disease' },
  { vaccine: 'Rotavirus', dose: 1, dueAtDays: 42, overdueAfterDays: 14, protectsAgainst: 'Rotavirus diarrhea' },
  { vaccine: 'Pentavalent', dose: 2, dueAtDays: 70, overdueAfterDays: 14, protectsAgainst: 'Diphtheria, pertussis, tetanus, Hepatitis B, Hib' },
  { vaccine: 'OPV', dose: 2, dueAtDays: 70, overdueAfterDays: 14, protectsAgainst: 'Poliomyelitis' },
  { vaccine: 'PCV', dose: 2, dueAtDays: 70, overdueAfterDays: 14, protectsAgainst: 'Pneumococcal disease' },
  { vaccine: 'Rotavirus', dose: 2, dueAtDays: 70, overdueAfterDays: 14, protectsAgainst: 'Rotavirus diarrhea' },
  { vaccine: 'Pentavalent', dose: 3, dueAtDays: 98, overdueAfterDays: 14, protectsAgainst: 'Diphtheria, pertussis, tetanus, Hepatitis B, Hib' },
  { vaccine: 'OPV', dose: 3, dueAtDays: 98, overdueAfterDays: 14, protectsAgainst: 'Poliomyelitis' },
  { vaccine: 'PCV', dose: 3, dueAtDays: 98, overdueAfterDays: 14, protectsAgainst: 'Pneumococcal disease' },
  { vaccine: 'IPV', dose: 1, dueAtDays: 98, overdueAfterDays: 30, protectsAgainst: 'Poliomyelitis' },
  { vaccine: 'Measles', dose: 1, dueAtDays: 270, overdueAfterDays: 30, protectsAgainst: 'Measles' }, // 9 months
  { vaccine: 'Yellow Fever', dose: 1, dueAtDays: 270, overdueAfterDays: 30, protectsAgainst: 'Yellow fever' },
  { vaccine: 'Vitamin A', dose: 1, dueAtDays: 180, overdueAfterDays: 60, protectsAgainst: 'Vitamin A deficiency (supplementation, not a vaccine)' },
  { vaccine: 'Measles', dose: 2, dueAtDays: 450, overdueAfterDays: 60, protectsAgainst: 'Measles' }, // ~15 months
  { vaccine: 'Vitamin A', dose: 2, dueAtDays: 365, overdueAfterDays: 60, protectsAgainst: 'Vitamin A deficiency (supplementation, not a vaccine)' },
];

/**
 * Computes the due/overdue/completed status of every scheduled dose for a
 * child of the given age, cross-referenced against which doses they've
 * actually received (by vaccine+dose key). Returns the full schedule
 * annotated with status — callers filter for what they need (e.g. "just
 * the overdue ones" for a CHW worklist).
 */
function computeImmunizationStatus(ageInDays, receivedDoses = []) {
  const receivedKeys = new Set(receivedDoses.map((d) => `${d.vaccine}_${d.dose}`));

  return IMMUNIZATION_SCHEDULE.map((entry) => {
    const key = `${entry.vaccine}_${entry.dose}`;
    const received = receivedKeys.has(key);

    let status;
    if (received) {
      status = 'completed';
    } else if (ageInDays < entry.dueAtDays) {
      status = 'not_yet_due';
    } else if (ageInDays <= entry.dueAtDays + entry.overdueAfterDays) {
      status = 'due';
    } else {
      status = 'overdue';
    }

    return { ...entry, status };
  });
}

module.exports = { IMMUNIZATION_SCHEDULE, computeImmunizationStatus };
