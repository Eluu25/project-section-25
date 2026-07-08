require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { db, initializationPromise } = require('../config/database');

const run = async () => {
  await initializationPromise;

  const user = await new Promise((resolve, reject) => {
    db.get("SELECT id, username, role FROM users WHERE role = 'loan_staff' OR role = 'admin' LIMIT 1", [], (err, row) => (
      err ? reject(err) : resolve(row)
    ));
  });

  const client = await new Promise((resolve, reject) => {
    db.get('SELECT id FROM clients LIMIT 1', [], (err, row) => (err ? reject(err) : resolve(row)));
  });

  if (!user || !client) {
    console.error('Need at least one staff user and one client in the database.');
    process.exit(1);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const pdfPath = path.join(__dirname, 'test-upload.pdf');
  const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  fs.writeFileSync(pdfPath, pdfContent);

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath), { filename: 'test.pdf', contentType: 'application/pdf' });
  form.append('client_id', String(client.id));
  form.append('type', 'Loan Supporting Document');

  const port = process.env.PORT || 5000;
  const res = await fetch(`http://127.0.0.1:${port}/api/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders()
    },
    body: form
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
  fs.unlinkSync(pdfPath);
  process.exit(res.ok ? 0 : 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
