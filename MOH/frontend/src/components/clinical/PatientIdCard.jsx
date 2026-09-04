import QRCode from 'react-qr-code';

/**
 * Branded, printable patient ID card. The QR payload is deliberately just
 * the MRN (e.g. "SL-2026-000123") — a bare identifier, not a URL and not
 * any clinical data — so scanning it at a front desk or in triage does
 * nothing more sensitive than pre-filling a search box with the MRN via
 * routes/patients.js's existing search-by-MRN path. No PII/PHI is ever
 * encoded into the card itself.
 *
 * Rendered inside a `data-print="only"` wrapper so the print stylesheet in
 * index.css (@media print) hides everything else on the page and prints
 * just the card, full-bleed, when the user hits Ctrl/Cmd+P.
 */
export default function PatientIdCard({ patient, facilityName }) {
  return (
    <div data-print="only">
      <div
        className="w-[336px] rounded-xl border border-border bg-canvas-raised overflow-hidden shadow-sm print:shadow-none print:border-2"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <div className="bg-teal px-4 py-3">
          <p className="text-[10px] font-mono tracking-widest text-white/80 uppercase">
            Ministry of Health &amp; Sanitation
          </p>
          <p className="text-sm font-semibold text-white mt-0.5">Patient Identification Card</p>
        </div>

        <div className="p-4 flex gap-4 items-start">
          <div className="bg-white p-2 rounded-md border border-border shrink-0">
            <QRCode value={patient.mrn} size={92} />
          </div>

          <div className="min-w-0">
            <p className="text-base font-semibold text-ink leading-tight truncate">{patient.fullName}</p>
            <p className="text-xs font-mono text-ink-soft mt-1">{patient.mrn}</p>
            <dl className="mt-2 text-xs text-ink-soft space-y-0.5">
              <div className="flex gap-1">
                <dt className="font-medium text-ink">Sex:</dt>
                <dd>{patient.sex}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="font-medium text-ink">DOB:</dt>
                <dd>
                  {patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : '—'}
                  {patient.dateOfBirthEstimated ? ' (est.)' : ''}
                </dd>
              </div>
              {facilityName && (
                <div className="flex gap-1">
                  <dt className="font-medium text-ink">Facility:</dt>
                  <dd className="truncate">{facilityName}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-border bg-canvas">
          <p className="text-[10px] text-ink-soft">
            Present this card at any MoH facility. Scanning the code looks up the record by MRN only — it does not
            reveal any medical information on its own.
          </p>
        </div>
      </div>
    </div>
  );
}
