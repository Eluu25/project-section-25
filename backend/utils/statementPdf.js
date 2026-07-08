const PDFDocument = require('pdfkit');

const COMPANY_NAME = process.env.STATEMENT_COMPANY_NAME || 'Edekise Microfinance';
const COMPANY_TAGLINE = process.env.STATEMENT_COMPANY_TAGLINE || 'Official Account Statement';
const BRAND_COLOR = '#0f766e';

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', { hour12: false });
};

const formatDateOnly = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB');
};

const formatMoney = (value) => `${Number(value || 0).toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const drawStatementBrandHeader = (doc) => {
  const top = doc.y;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc.save();
  doc.fillColor(BRAND_COLOR).roundedRect(left, top, 24, 24, 6).fill();
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text('EM', left + 7, top + 8);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text(COMPANY_NAME, left + 32, top + 2, { width: right - left - 150 });
  doc.font('Helvetica').fontSize(9).fillColor('#475569').text(COMPANY_TAGLINE, left + 32, top + 18, { width: right - left - 150 });
  doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`Generated: ${formatDateTime(new Date().toISOString())}`, right - 140, top + 4, { width: 140, align: 'right' });

  doc.moveDown(1.2);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.5);
};

const drawKeyValueGrid = (doc, rows = []) => {
  const left = doc.page.margins.left;
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 8;

  doc.font('Helvetica').fontSize(9).fillColor('#334155');
  rows.forEach((row, index) => {
    const x = index % 2 === 0 ? left : left + colWidth + 16;
    if (index % 2 === 0 && index > 0) doc.moveDown(0.35);
    doc.font('Helvetica-Bold').text(`${row.label}:`, x, doc.y, { continued: false, width: colWidth });
    const y = doc.y - 11;
    doc.font('Helvetica').text(row.value || 'N/A', x + 88, y, { width: colWidth - 88 });
    if (index % 2 === 1) doc.moveDown(0.2);
  });
  doc.moveDown(0.4);
};

const buildStatementPdf = ({ title, subtitleLines = [], summaryLines = [], transactions = [] }) => {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });

  drawStatementBrandHeader(doc);
  doc.fontSize(17).font('Helvetica-Bold').fillColor('#0f172a').text(title, { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica').fillColor('#475569');
  for (const line of subtitleLines) {
    doc.text(line);
  }
  doc.fillColor('#0f172a');
  doc.moveDown(0.6);

  if (summaryLines.length) {
    doc.fontSize(11).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.2);
    const summaryRows = summaryLines.map((line) => {
      const [label, ...rest] = String(line).split(':');
      return { label: label.trim(), value: rest.join(':').trim() || line };
    });
    drawKeyValueGrid(doc, summaryRows);
  }

  doc.fontSize(11).font('Helvetica-Bold').text('Transactions');
  doc.moveDown(0.25);

  const rows = (transactions || []).slice(0, 200);
  const tableTop = doc.y;
  const colWidths = [95, 70, 65, 65, 180];
  const headers = ['Date', 'Type', 'Amount', 'Balance', 'Description'];

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#f8fafc');
  doc.rect(doc.page.margins.left, tableTop, doc.page.width - doc.page.margins.left - doc.page.margins.right, 16).fill('#0f766e');
  doc.fillColor('#ffffff');
  let x = doc.page.margins.left + 6;
  headers.forEach((header, idx) => {
    doc.text(header, x, tableTop + 4, { width: colWidths[idx] - 6 });
    x += colWidths[idx];
  });

  let rowY = tableTop + 18;
  doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
  for (const t of rows) {
    if (rowY > doc.page.height - 80) break;
    const cells = [
      formatDateTime(t.created_at),
      String(t.transaction_type || ''),
      formatMoney(t.amount),
      t.balance_after === null || t.balance_after === undefined ? '—' : formatMoney(t.balance_after),
      String(t.description || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    ];
    x = doc.page.margins.left + 6;
    cells.forEach((cell, idx) => {
      doc.text(cell, x, rowY, { width: colWidths[idx] - 6 });
      x += colWidths[idx];
    });
    rowY += 14;
  }

  doc.moveDown(2);
  doc.fontSize(7).fillColor('#94a3b8').text(
    `This is a system-generated statement from ${COMPANY_NAME}. For inquiries, contact your branch.`,
    doc.page.margins.left,
    doc.page.height - 60,
    { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
  );

  return doc;
};

const buildTransactionStatementPdf = (transaction) => {
  const productLabel = transaction.account_type === 'loan'
    ? (transaction.loan_type || 'Loan')
    : (transaction.savings_type || 'Savings');

  return buildStatementPdf({
    title: 'Transaction Statement',
    subtitleLines: [
      `Transaction ID: ${transaction.id}`,
      `Client: ${transaction.client_name || 'N/A'}`,
      `Account: ${transaction.account_id || 'N/A'} (${transaction.account_type || 'N/A'})`,
      `Product: ${productLabel}`
    ],
    summaryLines: [
      `Type: ${transaction.transaction_type || 'N/A'}`,
      `Amount: ${formatMoney(transaction.amount)}`,
      `Balance before: ${formatMoney(transaction.balance_before)}`,
      `Balance after: ${formatMoney(transaction.balance_after)}`,
      `Description: ${transaction.description || 'N/A'}`,
      `Reference: ${transaction.transaction_reference || 'N/A'}`,
      `Recorded at: ${formatDateTime(transaction.created_at)}`,
      `Statement date: ${formatDateOnly(new Date().toISOString())}`
    ],
    transactions: [transaction]
  });
};

module.exports = {
  buildStatementPdf,
  buildTransactionStatementPdf,
  formatDateTime,
  formatDateOnly,
  formatMoney,
  COMPANY_NAME
};
