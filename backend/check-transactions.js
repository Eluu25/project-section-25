require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

const userId = 8;

console.log('=== Checking transactions for user ID', userId, '===\n');

// Check transactions
db.all('SELECT id, type, amount, status, created_at FROM transactions WHERE client_id = ? ORDER BY created_at DESC LIMIT 10', [userId], (err, transactions) => {
  if (err) console.error('Error querying transactions:', err);
  
  if (transactions && transactions.length) {
    console.log('=== Recent Transactions ===');
    transactions.forEach(t => {
      console.log(`\nID: ${t.id} | Type: ${t.type} | Amount: ${t.amount}`);
      console.log(`Status: ${t.status} | Created: ${new Date(t.created_at).toLocaleString()}`);
    });
  } else {
    console.log('No transactions found for client_id', userId);
  }

  // Check all emails for this user
  db.all('SELECT recipient_email, subject, status, sent_at FROM email_log WHERE recipient_email = ? ORDER BY sent_at DESC LIMIT 15', 
    ['hasetsiraj369@gmail.com'], 
    (err, emails) => {
    console.log('\n=== All Recent Emails ===');
    if (emails && emails.length) {
      emails.forEach(e => console.log(`[${e.status}] ${new Date(e.sent_at).toLocaleString()} - ${e.subject}`));
    } else {
      console.log('No emails found');
    }
    db.close();
  });
});
