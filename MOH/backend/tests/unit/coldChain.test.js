const { isBreach } = require('../../services/coldChainService');
const ColdChainDevice = require('../../models/ColdChainDevice');

describe('coldChainService — isBreach', () => {
  test('a temperature within the refrigerator range (2-8C) is not a breach', () => {
    expect(isBreach(5, 2, 8)).toBe(false);
    expect(isBreach(2, 2, 8)).toBe(false);
    expect(isBreach(8, 2, 8)).toBe(false);
  });

  test('too cold in a refrigerator is a breach', () => {
    expect(isBreach(1, 2, 8)).toBe(true);
    expect(isBreach(0, 2, 8)).toBe(true);
  });

  test('too warm in a refrigerator is a breach', () => {
    expect(isBreach(9, 2, 8)).toBe(true);
    expect(isBreach(20, 2, 8)).toBe(true);
  });

  test('a temperature within the freezer range (-25 to -15C) is not a breach', () => {
    expect(isBreach(-20, -25, -15)).toBe(false);
  });

  test('too warm in a freezer is a breach (e.g. a door left open)', () => {
    expect(isBreach(-10, -25, -15)).toBe(true);
  });

  test('too cold in a freezer is also a breach', () => {
    expect(isBreach(-30, -25, -15)).toBe(true);
  });
});

describe('ColdChainDevice — deviceTypeDefaults', () => {
  test('refrigerator defaults match verified WHO/CDC guidance (2-8C)', () => {
    expect(ColdChainDevice.deviceTypeDefaults.refrigerator).toEqual({ minSafeC: 2, maxSafeC: 8 });
  });

  test('freezer defaults match verified WHO/CDC guidance for freezer-stored EPI vaccines (-25 to -15C)', () => {
    expect(ColdChainDevice.deviceTypeDefaults.freezer).toEqual({ minSafeC: -25, maxSafeC: -15 });
  });
});
