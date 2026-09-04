/**
 * Sierra Leone's administrative hierarchy: province → district. Reflects
 * the 2017 district reorganization (Falaba split from Koinadugu, Karene
 * split from Bombali/Port Loko/Kambia) — 5 provinces/areas, 16 districts.
 *
 * Used to:
 *  - validate `province` on facility create/edit (routes/auth.js) against
 *    a real, closed list instead of a free-text field that would let
 *    every facility admin spell "Northern Province" a different way,
 *  - drive province/district filter dropdowns in the MoH staff directory
 *    and facilities views without a separate lookup table in the database
 *    for something that essentially never changes.
 *
 * Western Area is technically an "Area", not a "Province", but is grouped
 * here at the same hierarchy level since that's how it functions
 * administratively and how MoH facility/staff filtering needs to treat it.
 */
const SIERRA_LEONE_PROVINCES = {
  'Eastern Province': ['Kailahun', 'Kenema', 'Kono'],
  'Northern Province': ['Bombali', 'Falaba', 'Koinadugu', 'Tonkolili'],
  'North West Province': ['Kambia', 'Karene', 'Port Loko'],
  'Southern Province': ['Bo', 'Bonthe', 'Moyamba', 'Pujehun'],
  'Western Area': ['Western Area Urban', 'Western Area Rural'],
};

const ALL_PROVINCES = Object.keys(SIERRA_LEONE_PROVINCES);
const ALL_DISTRICTS = Object.values(SIERRA_LEONE_PROVINCES).flat();

function districtsForProvince(province) {
  return SIERRA_LEONE_PROVINCES[province] || [];
}

function provinceForDistrict(district) {
  return ALL_PROVINCES.find((p) => SIERRA_LEONE_PROVINCES[p].includes(district)) || null;
}

module.exports = { SIERRA_LEONE_PROVINCES, ALL_PROVINCES, ALL_DISTRICTS, districtsForProvince, provinceForDistrict };
