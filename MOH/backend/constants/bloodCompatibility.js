/**
 * BLOOD COMPATIBILITY REFERENCE DATA
 * -----------------------------------------------------------------------
 * Standard ABO/Rh compatibility rules, verified against current clinical
 * references (Red Cross, American Society of Hematology) before being
 * encoded here. This is universally-taught blood bank science, not a
 * novel or contested claim.
 *
 * CRITICAL SAFETY NOTE: this table supports INVENTORY-LEVEL compatibility
 * filtering only (which units a facility could reasonably consider for a
 * given recipient type) — it is NOT a substitute for a real crossmatch.
 * Every real transfusion requires laboratory ABO/Rh typing, antibody
 * screening, and a physical crossmatch against the specific recipient's
 * serum before release, regardless of what this table says. This system
 * has no way to detect the ~600+ non-ABO red cell antigens that can still
 * cause a reaction despite "compatible" ABO/Rh — nothing here should ever
 * be read by staff as clearance to skip that laboratory process.
 *
 * RBC_COMPATIBLE_DONORS: for red-cell-containing components (whole blood,
 * packed red cells), which donor blood types are compatible with a given
 * recipient type. Both ABO antigen/antibody matching AND Rh matching
 * apply here — an Rh-negative recipient can only safely receive
 * Rh-negative red cells (to avoid Rh sensitization, critical for
 * patients who may become pregnant), while an Rh-positive recipient can
 * receive either.
 *
 * PLASMA_COMPATIBLE_DONORS: for plasma-containing components (fresh
 * frozen plasma, cryoprecipitate), the ABO rule is the MIRROR IMAGE of
 * the red-cell rule — AB is the universal plasma donor, O is the
 * universal plasma recipient — because what matters for plasma is the
 * DONOR's antibodies attacking the RECIPIENT's red cell antigens, the
 * reverse direction from a red-cell transfusion. Rh matching is NOT
 * required for plasma products (RhD is a red-cell surface antigen; there
 * are no red cells in plasma to sensitize against), so this table is
 * ABO-only and does not vary by recipient Rh.
 */

const RBC_COMPATIBLE_DONORS = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

// Keyed by ABO group only (Rh doesn't gate plasma compatibility).
const PLASMA_COMPATIBLE_DONOR_ABO_GROUPS = {
  O: ['O', 'A', 'B', 'AB'], // universal plasma recipient
  A: ['A', 'AB'],
  B: ['B', 'AB'],
  AB: ['AB'], // most restrictive plasma recipient
};

const ALL_BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

function aboGroup(bloodType) {
  return bloodType.replace(/[+-]$/, '');
}

/** Component-specific shelf life from collection/preparation, used to compute expiry at intake. */
const SHELF_LIFE_DAYS_BY_COMPONENT = {
  whole_blood: 35,
  packed_red_cells: 42,
  platelets: 5, // stored at room temperature with agitation — by far the shortest-lived component
  fresh_frozen_plasma: 365,
  cryoprecipitate: 365,
};

const BLOOD_COMPONENTS = Object.keys(SHELF_LIFE_DAYS_BY_COMPONENT);
const PLASMA_CONTAINING_COMPONENTS = ['fresh_frozen_plasma', 'cryoprecipitate'];

/**
 * Returns the donor blood types compatible with `recipientType` for the
 * given `component`. Red-cell-containing components use the Rh-sensitive
 * table; plasma-containing components use the ABO-only, direction-reversed
 * table. Components that are neither (e.g. platelets, which are commonly
 * transfused across ABO lines in practice with lower strict specificity)
 * fall back to the RBC table as the more conservative default, since it's
 * the stricter of the two rather than assuming broader compatibility.
 */
function compatibleDonorTypes(recipientType, component) {
  if (!ALL_BLOOD_TYPES.includes(recipientType)) return [];

  if (PLASMA_CONTAINING_COMPONENTS.includes(component)) {
    const compatibleGroups = PLASMA_COMPATIBLE_DONOR_ABO_GROUPS[aboGroup(recipientType)] || [];
    return ALL_BLOOD_TYPES.filter((t) => compatibleGroups.includes(aboGroup(t)));
  }

  return RBC_COMPATIBLE_DONORS[recipientType] || [];
}

module.exports = {
  ALL_BLOOD_TYPES,
  BLOOD_COMPONENTS,
  PLASMA_CONTAINING_COMPONENTS,
  SHELF_LIFE_DAYS_BY_COMPONENT,
  RBC_COMPATIBLE_DONORS,
  PLASMA_COMPATIBLE_DONOR_ABO_GROUPS,
  aboGroup,
  compatibleDonorTypes,
};
