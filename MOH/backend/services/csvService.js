/**
 * Minimal, dependency-free CSV parser (RFC4180-ish): handles quoted fields,
 * embedded commas/quotes (`""` as an escaped quote), and \r\n or \n line
 * endings. Not a full spec implementation — notably it doesn't handle a
 * quoted field containing a literal newline, since rows are split by line
 * first. That's a deliberate trade-off: sufficient for the short, simple
 * rows this is built for (staff onboarding — name/role/email), and it
 * avoids pulling in a dependency for something this small. If this ever
 * needs to parse more complex exported data, swap in a real library (e.g.
 * papaparse) rather than extending this by hand.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip the escaped quote's second character
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parses CSV text into an array of row objects keyed by the header row.
 * Blank lines are skipped. Every value is trimmed.
 */
function parseCsv(text) {
  const lines = text.split(/\r\n|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] ?? '').trim();
    });
    return row;
  });
}

/**
 * Writes an array of row objects to CSV text, RFC4180-ish (quotes any
 * field containing a comma, quote, or newline; doubles embedded quotes).
 * Same dependency-free philosophy as parseCsv above — this is for small,
 * simple exports (report metrics, a few dozen rows), not a general-purpose
 * CSV library; swap in a real one if this ever needs to handle more.
 */
function toCsv(rows, columns) {
  function escapeField(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  const header = columns.map((c) => escapeField(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeField(row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

module.exports = { parseCsv, toCsv };
