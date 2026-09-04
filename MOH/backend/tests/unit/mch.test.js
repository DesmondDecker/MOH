const { computeImmunizationStatus, IMMUNIZATION_SCHEDULE } = require('../../constants/immunizationSchedule');
const { classifyMuac, ageInDaysAt } = require('../../services/growthService');

describe('immunizationSchedule — computeImmunizationStatus', () => {
  test('a newborn (age 0) has BCG and OPV0 due immediately', () => {
    const status = computeImmunizationStatus(0, []);
    expect(status.find((e) => e.vaccine === 'BCG').status).toBe('due');
    expect(status.find((e) => e.vaccine === 'OPV' && e.dose === 0).status).toBe('due');
  });

  test('a newborn does not yet have the 6-week doses due', () => {
    const status = computeImmunizationStatus(0, []);
    expect(status.find((e) => e.vaccine === 'Pentavalent' && e.dose === 1).status).toBe('not_yet_due');
  });

  test('an unvaccinated 20-week-old (140 days) has the 6/10/14-week doses overdue', () => {
    const status = computeImmunizationStatus(140, []);
    expect(status.find((e) => e.vaccine === 'Pentavalent' && e.dose === 1).status).toBe('overdue');
    expect(status.find((e) => e.vaccine === 'Pentavalent' && e.dose === 3).status).toBe('overdue');
  });

  test('an unvaccinated 20-week-old does not yet have the 9-month measles dose due', () => {
    const status = computeImmunizationStatus(140, []);
    expect(status.find((e) => e.vaccine === 'Measles' && e.dose === 1).status).toBe('not_yet_due');
  });

  test('a received dose is marked completed regardless of age', () => {
    const status = computeImmunizationStatus(140, [{ vaccine: 'Pentavalent', dose: 1 }, { vaccine: 'Pentavalent', dose: 2 }, { vaccine: 'Pentavalent', dose: 3 }]);
    expect(status.find((e) => e.vaccine === 'Pentavalent' && e.dose === 3).status).toBe('completed');
  });

  test('a dose within its grace window reads as due, not overdue', () => {
    // Pentavalent dose 1 due at 42 days, 14-day grace window
    const status = computeImmunizationStatus(50, []);
    expect(status.find((e) => e.vaccine === 'Pentavalent' && e.dose === 1).status).toBe('due');
  });

  test('every scheduled entry has a valid status for a fully-vaccinated 2-year-old', () => {
    const allDoses = IMMUNIZATION_SCHEDULE.map((e) => ({ vaccine: e.vaccine, dose: e.dose }));
    const status = computeImmunizationStatus(730, allDoses);
    expect(status.every((e) => e.status === 'completed')).toBe(true);
  });
});

describe('growthService — classifyMuac', () => {
  const twoYearsInDays = 24 * 30.4375;

  test('MUAC below 11.5cm is severe acute malnutrition', () => {
    expect(classifyMuac(11.0, twoYearsInDays)).toBe('severe_acute_malnutrition');
    expect(classifyMuac(11.49, twoYearsInDays)).toBe('severe_acute_malnutrition');
  });

  test('MUAC 11.5cm up to but not including 12.5cm is moderate acute malnutrition', () => {
    expect(classifyMuac(11.5, twoYearsInDays)).toBe('moderate_acute_malnutrition');
    expect(classifyMuac(12.49, twoYearsInDays)).toBe('moderate_acute_malnutrition');
  });

  test('MUAC 12.5cm and above is normal', () => {
    expect(classifyMuac(12.5, twoYearsInDays)).toBe('normal');
    expect(classifyMuac(15, twoYearsInDays)).toBe('normal');
  });

  test('bilateral pitting edema overrides the MUAC band to severe, even with a normal reading', () => {
    expect(classifyMuac(15, twoYearsInDays, true)).toBe('severe_acute_malnutrition');
  });

  test('MUAC screening does not apply outside 6-59 months', () => {
    expect(classifyMuac(11, 3 * 30.4375)).toBe('not_applicable'); // 3 months old
    expect(classifyMuac(11, 70 * 30.4375)).toBe('not_applicable'); // ~70 months old
  });

  test('returns not_measured when no MUAC value was given', () => {
    expect(classifyMuac(undefined, twoYearsInDays)).toBe('not_measured');
    expect(classifyMuac(null, twoYearsInDays)).toBe('not_measured');
  });
});

describe('growthService — ageInDaysAt', () => {
  test('computes whole days between two dates', () => {
    const dob = new Date('2024-01-01T00:00:00Z');
    const on = new Date('2024-01-11T00:00:00Z');
    expect(ageInDaysAt(dob, on)).toBe(10);
  });

  test('defaults to now when no reference date is given', () => {
    const dob = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(ageInDaysAt(dob)).toBeGreaterThanOrEqual(4);
    expect(ageInDaysAt(dob)).toBeLessThanOrEqual(6);
  });
});
