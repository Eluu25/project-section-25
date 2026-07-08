require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

console.log('=== Checking 19999.75 Deposit ===\n');

// Get the transaction
db.get('SELECT * FROM transactions WHERE amount = 19999.75 ORDER BY created_at DESC LIMIT 1', (err, transaction) => {
  if (transaction) {
    console.log('=== Transaction Details ===');
    console.log(`ID: ${transaction.id}`);
    console.log(`Account ID: ${transaction.account_id}`);
    console.log(`Amount: ${transaction.amount}`);
    console.log(`Type: ${transaction.transaction_type}`);
    console.log(`Status: ${transaction.status}`);
    console.log(`Created: ${transaction.created_at}`);
    console.log(`Description: ${transaction.description}`);
    
    // Get account details
    db.get('SELECT * FROM savings_accounts WHERE id = ?', [transaction.account_id], (err, account) => {
      if (account) {
        console.log('\n=== Account Details ===');
        console.log(`Account ID: ${account.id}`);
        console.log(`User ID: ${account.user_id}`);
        console.log(`Account Number: ${account.account_number}`);
        console.log(`Balance: ${account.balance}`);
        
        // Get user details
        db.get('SELECT id, username, email FROM users WHERE id = ?', [account.user_id], (err, user) => {
          if (user) {
            console.log('\n=== User Details ===');
            console.log(`ID: ${user.id}`);
            console.log(`Username: ${user.username}`);
            console.log(`Email: ${user.email}`);
            
            // Check for deposit notification email
            db.all('SELECT recipient_email, subject, status, sent_at, body FROM email_log WHERE recipient_email = ? AND sent_at > ? ORDER BY sent_at DESC', 
              [user.email, transaction.created_at], (err, emails) => {
              console.log('\n=== Emails After Transaction ===');
              if (emails && emails.length) {
                emails.forEach(e => {
                  console.log(`\n[${e.status}] ${new Date(e.sent_at).toLocaleString()}`);
                  console.log(`Subject: ${e.subject}`);
                });
              } else {
                console.log('⚠️  NO NOTIFICATION EMAILS FOUND AFTER THIS TRANSACTION');
              }
              
              // Check all emails for this user
              db.all('SELECT recipient_email, subject, status, sent_at FROM email_log WHERE recipient_email = ? ORDER BY sent_at DESC LIMIT 10', 
                [user.email], (err, allEmails) => {
                console.log('\n=== All Recent Emails for User ===');
                if (allEmails && allEmails.length) {
                  allEmails.forEach(e => {
                    console.log(`[${e.status}] ${new Date(e.sent_at).toLocaleString()} - ${e.subject}`);
                  });
                }
                db.close();
              });
            });
          }
        });
      }
    });
  } else {
    console.log('Transaction not found');
    db.close();
  }
});
