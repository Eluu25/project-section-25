require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

console.log('=== Searching for Related Approval Requests ===\n');

db.all('SELECT id, client_id, type, status, description, created_at, approved_at FROM approval_requests WHERE client_id = ? ORDER BY created_at DESC LIMIT 10', 
  [4], (err, approvals) => {
  if (approvals && approvals.length) {
    console.log('Approvals for client 4:');
    approvals.forEach(a => {
      console.log(`\nID: ${a.id}`);
      console.log(`Type: ${a.type} | Status: ${a.status}`);
      console.log(`Created: ${a.created_at}`);
      console.log(`Description: ${a.description}`);
    });
  } else {
    console.log('No approval requests found for this client');
  }

  // Check who created the transaction (user ID 2)
  console.log('\n=== User who Created Transaction ===');
  db.get('SELECT id, name, username, role FROM users WHERE id = ?', [2], (err, creator) => {
    if (creator) {
      console.log(`Name: ${creator.name}`);
      console.log(`Username: ${creator.username}`);
      console.log(`Role: ${creator.role}`);
    }

    // Check backend logs for any errors
    console.log('\n=== Checking if Notification Preference is ENABLED ===');
    db.get('SELECT id, name, email, notify_email, notify_sms, notify_payment_reminders FROM clients WHERE id = ?', [4], (err, client) => {
      console.log(`notify_email: ${client.notify_email} (1=enabled, 0=disabled)`);
      console.log(`notify_sms: ${client.notify_sms}`);
      console.log(`notify_payment_reminders: ${client.notify_payment_reminders}`);
      
      if (client.notify_email === 0) {
        console.log('\n⚠️  EMAIL NOTIFICATIONS ARE DISABLED FOR THIS CLIENT!');
      } else {
        console.log('\n✓ Email notifications are enabled');
      }
      db.close();
    });
  });
});
