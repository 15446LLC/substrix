const PDFDocument = require('pdfkit');
const { fetchCompanyInfo } = require('./qbo');
const { buildReconciliationHealth } = require('./reconciliation');
const { buildUndepositedFundsHealth } = require('./undepositedFunds');
const { buildUnappliedTransactionsHealth } = require('./unappliedTransactions');

const COLORS = {
  green: '#28a745',
  yellow: '#e0a800',
  red: '#dc3545',
  text: '#1a1a1a',
  muted: '#666666',
  faint: '#999999',
  line: '#dddddd',
};

const MARGIN = 50;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BOTTOM = 730;

function fmtMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

class ReportWriter {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
  }

  ensureRoom(height) {
    if (this.y + height > BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  dot(x, color) {
    this.doc.circle(x + 3, this.y + 4, 3).fill(COLORS[color] || COLORS.faint);
  }

  sectionTitle(title) {
    this.ensureRoom(40);
    this.y += 14;
    this.doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text)
      .text(title, MARGIN, this.y);
    this.y += 20;
    this.doc.moveTo(MARGIN, this.y).lineTo(PAGE_WIDTH - MARGIN, this.y)
      .lineWidth(0.5).strokeColor(COLORS.line).stroke();
    this.y += 8;
  }

  note(text) {
    this.ensureRoom(24);
    this.doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.faint)
      .text(text, MARGIN, this.y, { width: CONTENT_WIDTH });
    this.y += this.doc.heightOfString(text, { width: CONTENT_WIDTH }) + 6;
  }

  tableHeader(cols) {
    this.ensureRoom(20);
    this.doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted);
    for (const c of cols) {
      this.doc.text(c.label.toUpperCase(), c.x, this.y, { width: c.w, align: c.align || 'left' });
    }
    this.y += 12;
    this.doc.moveTo(MARGIN, this.y).lineTo(PAGE_WIDTH - MARGIN, this.y)
      .lineWidth(0.5).strokeColor(COLORS.line).stroke();
    this.y += 5;
  }

  // pdfkit wraps text when width is set (even with lineBreak: false), so
  // truncate to the column width manually
  fitText(text, width) {
    let t = String(text ?? '—');
    if (this.doc.widthOfString(t) <= width) return t;
    while (t.length > 1 && this.doc.widthOfString(t + '…') > width) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  tableRow(cols, values, opts = {}) {
    this.ensureRoom(18);
    this.doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
      .fillColor(opts.color || COLORS.text);
    values.forEach((v, i) => {
      const c = cols[i];
      this.doc.text(this.fitText(v, c.w), c.x, this.y, {
        width: c.w,
        align: c.align || 'left',
        lineBreak: false,
      });
    });
    this.y += 15;
  }
}

async function generatePdfReport(session, stream) {
  const [companyInfo, accounts, uf, unapplied] = await Promise.all([
    fetchCompanyInfo(session).catch(() => null),
    buildReconciliationHealth(session),
    buildUndepositedFundsHealth(session),
    buildUnappliedTransactionsHealth(session),
  ]);

  // Bottom margin below the footer's y position, so writing the footer
  // never triggers pdfkit's auto page break
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: 20, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });
  doc.pipe(stream);
  const w = new ReportWriter(doc);

  // --- Title block ---
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text)
    .text('Substrix', MARGIN, w.y);
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted)
    .text('Books Health Report', MARGIN, w.y + 24);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  doc.fontSize(9).fillColor(COLORS.muted)
    .text(`${companyInfo?.CompanyName || 'QuickBooks Company'}  ·  ${today}`, MARGIN, w.y + 40);
  w.y += 58;
  doc.moveTo(MARGIN, w.y).lineTo(PAGE_WIDTH - MARGIN, w.y).lineWidth(1).strokeColor(COLORS.text).stroke();
  w.y += 4;

  // --- Section 1: Reconciliation Health ---
  w.sectionTitle('Reconciliation Health');
  const recCols = [
    { label: 'Account', x: MARGIN + 12, w: 168 },
    { label: 'Last reconciled', x: MARGIN + 185, w: 95 },
    { label: 'Unrec. before rec', x: MARGIN + 285, w: 90, align: 'right' },
    { label: 'Sum', x: MARGIN + 380, w: 70, align: 'right' },
    { label: 'Earliest', x: MARGIN + 455, w: 57, align: 'right' },
  ];
  w.tableHeader(recCols);
  for (const a of accounts) {
    const worst = [a.recDateColor, a.unreconciledColor].includes('red') ? 'red'
      : [a.recDateColor, a.unreconciledColor].includes('yellow') ? 'yellow' : 'green';
    w.ensureRoom(18);
    w.dot(MARGIN, worst);
    w.tableRow(recCols, [
      a.name,
      a.lastRecDate ? `${fmtDate(a.lastRecDate)} (${a.daysSinceRec}d)` : 'Never',
      `${a.unreconciledCount} txn${a.unreconciledCount === 1 ? '' : 's'}`,
      a.unreconciledCount ? fmtMoney(a.unreconciledSum) : '—',
      fmtDate(a.earliestUnreconciledDate),
    ]);
  }

  // --- Section 2: Undeposited Funds ---
  w.sectionTitle('Undeposited Funds Hygiene');
  if (!uf) {
    w.note('No "Undeposited Funds" account found on this company.');
  } else {
    const b = uf.buckets;
    const ufColor = uf.balance === 0 ? 'green' : (b.over12Months.sum > 0 ? 'red' : 'yellow');
    const ufCols = [
      { label: 'Balance', x: MARGIN + 12, w: 110 },
      { label: 'Unswept < 30 days', x: MARGIN + 130, w: 120, align: 'right' },
      { label: '30 days – 12 months', x: MARGIN + 255, w: 125, align: 'right' },
      { label: '> 12 months', x: MARGIN + 385, w: 127, align: 'right' },
    ];
    w.tableHeader(ufCols);
    w.ensureRoom(18);
    w.dot(MARGIN, ufColor);
    const cell = bk => bk.count === 0 ? '—' : `${fmtMoney(bk.sum)} (${bk.count})`;
    w.tableRow(ufCols, [fmtMoney(uf.balance), cell(b.last30Days), cell(b.last30DaysTo12Months), cell(b.over12Months)]);
  }

  // --- Section 3: Unapplied Payments & Credits ---
  w.sectionTitle('Unapplied Payments & Credits');
  const utCols = [
    { label: 'Side', x: MARGIN + 12, w: 190 },
    { label: '< 30 days', x: MARGIN + 205, w: 85, align: 'right' },
    { label: '30d – 12 mo', x: MARGIN + 295, w: 85, align: 'right' },
    { label: '> 12 months', x: MARGIN + 385, w: 60, align: 'right' },
    { label: 'Total', x: MARGIN + 450, w: 62, align: 'right' },
  ];
  w.tableHeader(utCols);
  const cellB = bk => bk.count === 0 ? '—' : `${fmtMoney(bk.sum)} (${bk.count})`;
  for (const [label, side] of [
    ['Customer (Payments, Deposits + Credits)', unapplied.customer],
    ['Vendor (Credits + Overpayments)', unapplied.vendor],
  ]) {
    const color = side.totalSum === 0 ? 'green'
      : side.buckets.over12Months.sum > 0 || side.buckets.last30DaysTo12Months.sum > 0 ? 'red' : 'yellow';
    w.ensureRoom(18);
    w.dot(MARGIN, color);
    w.tableRow(utCols, [
      label,
      cellB(side.buckets.last30Days),
      cellB(side.buckets.last30DaysTo12Months),
      cellB(side.buckets.over12Months),
      side.totalSum === 0 ? '—' : fmtMoney(side.totalSum),
    ]);
  }

  w.y += 8;
  w.note('Transaction-level detail for each finding is available in the Substrix dashboard drill-downs.');

  // --- Footer on every page ---
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.faint)
      .text(
        `Generated live from QuickBooks Online by Substrix (substrix.15446.com) · ${today} · Page ${i + 1} of ${range.count}`,
        MARGIN, 752, { width: CONTENT_WIDTH, align: 'center', lineBreak: false }
      );
  }

  doc.end();
}

module.exports = { generatePdfReport };
