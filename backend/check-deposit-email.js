require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

console.log('=== Transaction Details ===\n');

db.get('SELECT * FROM transactions WHERE amount = 19999.75 AND transaction_type = ?', ['deposit'], (err, trans) => {
  if (trans) {
    console.log(JSON.stringify(trans, null, 2));
    
    console.log('\n=== Checking Approval Request ===');
    if (trans.approval_request_id) {
      db.get('SELECT id, client_id, type, status, description, created_at, approved_at FROM approval_requests WHERE id = ?', 
        [trans.approval_request_id], (err, req) => {
        if (req) {
          console.log(JSON.stringify(req, null, 2));
        } else {
          console.log('No approval request found');
        }
        
        // Check the email log to see if ANY email was sent for this transaction
        console.log('\n=== Email Log Search ===');
        db.all('SELECT recipient_email, subject, status, sent_at, body FROM email_log WHERE body LIKE ? OR subject LIKE ? ORDER BY sent_at DESC LIMIT 5', 
          ['%19999%', '%deposit%'], (err, emails) => {
          console.log('Emails containing "19999" or "deposit":');
          if (emails && emails.length) {
            emails.forEach(e => {
              console.log(`\n[${e.status}] ${e.subject}`);
              console.log(`To: ${e.recipient_email}`);
            });
          } else {
            console.log('None found');
          }
          db.close();
        });
      });
    } else {
      console.log('No approval_request_id (direct deposit)');
      db.close();
    }
  } else {
    console.log('Transaction not found');
    db.close();
  }
});
