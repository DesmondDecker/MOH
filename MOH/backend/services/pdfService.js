const PDFDocument = require('pdfkit');

const LABEL_COLOR = '#64748b'; // matches --color-ink-soft (white theme)
const INK_COLOR = '#0f172a'; // matches --color-ink (white theme)
const RULE_COLOR = '#e2e8f0'; // matches --color-border (white theme)

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calculateAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function sectionHeading(doc, text) {
  doc.moveDown(0.75);
  doc.fontSize(11).fillColor(INK_COLOR).font('Helvetica-Bold').text(text.toUpperCase(), { characterSpacing: 0.5 });
  doc
    .moveTo(doc.x, doc.y + 2)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
    .strokeColor(RULE_COLOR)
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.5);
}

function labelValue(doc, label, value, opts = {}) {
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor(LABEL_COLOR)
    .text(label.toUpperCase(), { continued: false, ...opts });
  doc
    .fontSize(11)
    .font('Helvetica')
    .fillColor(INK_COLOR)
    .text(value || '—');
  doc.moveDown(0.4);
}

/**
 * Builds a discharge summary (encounter closed, no referral) or a referral
 * letter (encounter.referral.referredToFacilityId set — takes precedence,
 * since a referral is the more specific/urgent document even mid-encounter)
 * as a PDFKit document and pipes it directly to `res`. Caller is
 * responsible for setting Content-Type/Content-Disposition headers before
 * calling this, and for everything else (auth, audit logging, marking
 * dischargeSummaryGeneratedAt) — this function only lays out the page.
 */
function streamDischargeOrReferralPdf({ res, patient, facility, encounter, referredToFacility, medications, generatedByUser }) {
  const isReferral = !!encounter.referral?.referredToFacilityId;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  doc.pipe(res);

  // --- Letterhead -----------------------------------------------------
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor(LABEL_COLOR)
    .text('REPUBLIC OF SIERRA LEONE', { align: 'center' })
    .text('MINISTRY OF HEALTH AND SANITATION — NATIONAL MOH digital health and inventory platform', { align: 'center' });
  doc.moveDown(0.75);
  doc
    .fontSize(20)
    .font('Helvetica-Bold')
    .fillColor(INK_COLOR)
    .text(isReferral ? 'Referral Letter' : 'Discharge Summary', { align: 'center' });
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor(LABEL_COLOR)
    .text(facility.name + (facility.code ? ` (${facility.code})` : ''), { align: 'center' })
    .text(facility.district || '', { align: 'center' });
  doc
    .moveTo(doc.page.margins.left, doc.y + 10)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 10)
    .strokeColor(INK_COLOR)
    .lineWidth(1)
    .stroke();
  doc.moveDown(1.25);

  // --- Patient ----------------------------------------------------------
  sectionHeading(doc, 'Patient');
  const age = calculateAge(patient.dateOfBirth);
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;
  const leftX = doc.x;
  const rightX = doc.x + colWidth + 20;
  const topY = doc.y;

  doc.x = leftX;
  doc.y = topY;
  labelValue(doc, 'Full name', patient.fullName, { width: colWidth });
  labelValue(
    doc,
    'Date of birth',
    patient.dateOfBirth
      ? `${new Date(patient.dateOfBirth).toLocaleDateString()}${age !== null ? ` (${age} yrs)` : ''}${patient.dateOfBirthEstimated ? ' — estimated' : ''}`
      : 'Unknown',
    { width: colWidth }
  );

  doc.x = rightX;
  doc.y = topY;
  labelValue(doc, 'MRN', patient.mrn, { width: colWidth });
  labelValue(doc, 'Sex', patient.sex, { width: colWidth });

  doc.x = leftX;

  if (patient.allergies?.length > 0) {
    labelValue(
      doc,
      'Allergies',
      patient.allergies.map((a) => `${a.substance}${a.severity ? ` (${a.severity})` : ''}`).join(', ')
    );
  }
  if (patient.chronicConditions?.length > 0) {
    labelValue(doc, 'Chronic conditions', patient.chronicConditions.map((c) => c.condition).join(', '));
  }

  // --- Encounter ----------------------------------------------------------
  sectionHeading(doc, 'Encounter');
  labelValue(doc, 'Type', (encounter.type || '').replace(/_/g, ' '));
  labelValue(doc, 'Admitted', formatDate(encounter.admittedAt));
  if (encounter.dischargedAt) labelValue(doc, 'Discharged', formatDate(encounter.dischargedAt));
  if (encounter.chiefComplaint) labelValue(doc, 'Chief complaint', encounter.chiefComplaint);
  if (encounter.emergencyOverride?.used) {
    labelValue(doc, 'Access note', `Recorded under emergency/break-glass access — ${encounter.emergencyOverride.justification || 'no justification on file'}`);
  }

  const v = encounter.vitals;
  if (v && (v.temperatureC || v.bloodPressureSystolic || v.heartRateBpm || v.weightKg)) {
    const parts = [];
    if (v.temperatureC) parts.push(`Temp ${v.temperatureC} degC`);
    if (v.bloodPressureSystolic && v.bloodPressureDiastolic) {
      parts.push(`BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`);
    }
    if (v.heartRateBpm) parts.push(`HR ${v.heartRateBpm} bpm`);
    if (v.respiratoryRate) parts.push(`RR ${v.respiratoryRate}`);
    if (v.oxygenSaturation) parts.push(`SpO2 ${v.oxygenSaturation}%`);
    if (v.weightKg) parts.push(`Weight ${v.weightKg} kg`);
    labelValue(doc, `Vitals (as of ${formatDate(v.recordedAt)})`, parts.join('  ·  '));
  }

  // --- Diagnoses ----------------------------------------------------------
  if (encounter.diagnosis?.length > 0) {
    sectionHeading(doc, 'Diagnoses');
    encounter.diagnosis.forEach((d) => {
      const flags = [d.isPrimary && 'primary', d.isNotifiableDisease && 'notifiable'].filter(Boolean);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor(INK_COLOR)
        .text(`•  ${d.description}${d.icd10Code ? ` (${d.icd10Code})` : ''}${flags.length ? ` — ${flags.join(', ')}` : ''}`);
    });
  }

  // --- Medications ----------------------------------------------------------
  if (medications.length > 0) {
    sectionHeading(doc, 'Medications this encounter');
    medications.forEach((m) => {
      const p = m.prescription || {};
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor(INK_COLOR)
        .text(
          `•  ${p.drugName || 'Unnamed drug'} — ${p.dosage || ''} ${p.frequency || ''}${p.durationDays ? `, ${p.durationDays} days` : ''}`.trim()
        );
      if (p.allergyConflictOverridden) {
        doc
          .fontSize(9)
          .fillColor(LABEL_COLOR)
          .text(`   Prescribed despite recorded allergy — ${p.overrideJustification || 'no justification on file'}`);
      }
    });
  }

  // --- Referral ----------------------------------------------------------
  if (isReferral) {
    sectionHeading(doc, 'Referral');
    labelValue(doc, 'Referred to', referredToFacility ? `${referredToFacility.name} (${referredToFacility.code})` : 'Unknown facility');
    labelValue(doc, 'Urgency', encounter.referral.urgency || 'routine');
    if (encounter.referral.reason) labelValue(doc, 'Reason for referral', encounter.referral.reason);
  }

  if (encounter.notes) {
    sectionHeading(doc, 'Additional notes');
    doc.fontSize(11).font('Helvetica').fillColor(INK_COLOR).text(encounter.notes);
  }

  // --- Footer / signature ----------------------------------------------------------
  doc.moveDown(2);
  doc
    .moveTo(doc.x, doc.y)
    .lineTo(doc.x + 220, doc.y)
    .strokeColor(RULE_COLOR)
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.25);
  doc.fontSize(9).font('Helvetica').fillColor(LABEL_COLOR).text('Attending clinician signature');

  doc.moveDown(1.5);
  doc
    .fontSize(8)
    .fillColor(LABEL_COLOR)
    .text(
      `Generated by ${generatedByUser.fullName} (${generatedByUser.role}) on ${formatDate(new Date())} — this document is derived from the national MOH digital health and inventory platform and is not a substitute for the original encounter record.`,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
    );

  doc.end();
}

/**
 * Renders a donor/program-report PDF: letterhead, scope/date-range
 * summary, then a table of the requested metrics with their computed
 * values. Shares the same colors/typography helpers as the discharge
 * summary above so every PDF this system produces reads as one
 * consistent, branded document family rather than looking like it came
 * from two different tools.
 */
function streamMetricsReportPdf({ res, title, scopeLabel, dateFrom, dateTo, metrics, generatedByUser }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(9).fillColor(LABEL_COLOR).font('Helvetica').text('MINISTRY OF HEALTH & SANITATION — SIERRA LEONE', { characterSpacing: 0.5 });
  doc.fontSize(18).fillColor(INK_COLOR).font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(LABEL_COLOR).font('Helvetica').text(`Scope: ${scopeLabel}`);
  doc.text(`Period: ${formatDate(dateFrom).split(',')[0]} \u2013 ${formatDate(dateTo).split(',')[0]}`);
  doc.text(`Generated: ${formatDate(new Date())}${generatedByUser ? ` by ${generatedByUser}` : ''}`);

  sectionHeading(doc, 'Metrics');

  const byCategory = {};
  for (const m of metrics) {
    byCategory[m.category] = byCategory[m.category] || [];
    byCategory[m.category].push(m);
  }

  for (const [category, items] of Object.entries(byCategory)) {
    doc.fontSize(10).fillColor(INK_COLOR).font('Helvetica-Bold').text(category);
    doc.moveDown(0.2);
    for (const m of items) {
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(INK_COLOR)
        .text(m.label, { continued: true, width: 380 })
        .font('Helvetica-Bold')
        .text(`  ${m.value.toLocaleString()} ${m.unit}`, { align: 'right' });
    }
    doc.moveDown(0.5);
  }

  doc.moveDown(1);
  doc
    .fontSize(8)
    .fillColor(LABEL_COLOR)
    .font('Helvetica')
    .text(
      'This report is generated directly from the MoH digital health and inventory platform\u2019s live data. Figures reflect records as of the generation time above and are not independently audited.',
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
    );

  doc.end();
}

module.exports = { streamDischargeOrReferralPdf, streamMetricsReportPdf };
