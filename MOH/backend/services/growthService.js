/**
 * MUAC-based acute malnutrition screening, ages 6-59 months only —
 * outside that range MUAC is not a validated screening tool and this
 * deliberately returns 'not_applicable' rather than a potentially
 * misleading band. Cutoffs verified against WHO/CDC reference material:
 * <11.5cm severe, 11.5-<12.5cm moderate, >=12.5cm normal.
 *
 * `oedemaPresent` overrides the MUAC-based band entirely: bilateral
 * pitting edema is itself a WHO-recognized diagnostic marker of severe
 * acute malnutrition (kwashiorkor) regardless of what MUAC or any other
 * anthropometric measurement shows — a child with edema and a "normal"
 * MUAC reading is still SAM, not normal. Getting this override backwards
 * would be a real missed-diagnosis risk, not just an inventory sorting
 * issue.
 */
function classifyMuac(muacCm, ageInDays, oedemaPresent = false) {
  if (oedemaPresent) return 'severe_acute_malnutrition';

  const ageInMonths = ageInDays / 30.4375; // average month length — fine for a screening band, not a precise clinical age calc
  if (ageInMonths < 6 || ageInMonths > 59) return 'not_applicable';
  if (muacCm === undefined || muacCm === null) return 'not_measured';
  if (muacCm < 11.5) return 'severe_acute_malnutrition';
  if (muacCm < 12.5) return 'moderate_acute_malnutrition';
  return 'normal';
}

function ageInDaysAt(dateOfBirth, onDate = new Date()) {
  return Math.floor((onDate.getTime() - new Date(dateOfBirth).getTime()) / (24 * 60 * 60 * 1000));
}

module.exports = { classifyMuac, ageInDaysAt };
