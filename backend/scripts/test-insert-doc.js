require('dotenv').config();
const { db, initializationPromise } = require('../config/database');

initializationPromise.then(() => {
  db.get('SELECT id FROM clients LIMIT 1', [], (err, client) => {
    if (err || !client) {
      console.error('No client', err);
      process.exit(1);
    }
    const docId = `DOC-TEST-${Date.now()}`;
    db.run(
      `INSERT INTO documents (id, client_id, loan_id, approval_request_id, related_entity_type, related_entity_id, type, file_name, file_path, file_hash, receipt_reference, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [docId, client.id, null, null, null, null, 'Loan Supporting Document', 't.pdf', 'uploads/t.pdf', 'abc', null, 'Verified', 1],
      function (insertErr) {
        console.log('insert error:', insertErr?.message || 'none');
        if (insertErr) process.exit(1);
        db.run('DELETE FROM documents WHERE id = ?', [docId], () => {
          console.log('insert ok');
          process.exit(0);
        });
      }
    );
  });
});
