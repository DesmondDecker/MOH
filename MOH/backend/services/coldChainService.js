/** True if a temperature reading falls outside a device's configured safe range. */
function isBreach(temperatureC, minSafeC, maxSafeC) {
  return temperatureC < minSafeC || temperatureC > maxSafeC;
}

module.exports = { isBreach };
