const fs = require('fs');
const path = require('path');
const { ANALYTICS_READ_PREFERENCE } = require('../../services/dbReadPreference');

describe('dbReadPreference', () => {
  test('exports a valid MongoDB read preference mode', () => {
    // 'secondaryPreferred' is a real, spec-defined MongoDB read preference
    // mode (routes to a secondary when available, falls back to primary
    // otherwise) — not an arbitrary string this codebase invented.
    const validModes = ['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];
    expect(validModes).toContain(ANALYTICS_READ_PREFERENCE);
  });

  test('every countDocuments/aggregate/find call in the report metric registry has read-preference routing applied', () => {
    // Reads the actual source rather than re-deriving the list by hand —
    // this test breaks (correctly) if a future metric is added without
    // .read() applied, rather than silently missing the gap.
    const source = fs.readFileSync(path.join(__dirname, '../../constants/reportMetrics.js'), 'utf8');

    const countDocumentsCalls = (source.match(/\.countDocuments\(/g) || []).length;
    const aggregateCalls = (source.match(/\.aggregate\(/g) || []).length;
    // Deliberately excludes METRICS.find(...) at the bottom of the file —
    // that's a plain JS Array.prototype.find over an in-memory array, not
    // a Mongoose query, and has no read preference to apply.
    const findCalls = (source.match(/InventoryItem\.find\(/g) || []).length;
    const readCalls = (source.match(/\.read\(ANALYTICS_READ_PREFERENCE\)/g) || []).length;

    expect(countDocumentsCalls).toBeGreaterThan(0); // sanity check the file actually has queries to check
    expect(readCalls).toBe(countDocumentsCalls + aggregateCalls + findCalls);
  });

  test('every heavy aggregation in the MoH dashboard route has read-preference routing applied', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../routes/moh.js'), 'utf8');

    const aggregateCalls = (source.match(/\.aggregate\(/g) || []).length;
    const readCalls = (source.match(/\.read\(ANALYTICS_READ_PREFERENCE\)/g) || []).length;

    expect(aggregateCalls).toBeGreaterThan(0);
    expect(readCalls).toBeGreaterThanOrEqual(aggregateCalls);
  });
});
