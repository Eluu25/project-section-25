require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

console.log('=== Looking for 20000 charge ===\n');

// Search all recent transactions for amount 20000
db.all('SELECT * FROM transactions WHERE amount = 20000 ORDER BY created_at DESC LIMIT 10', (err, transactions) => {
  if (err) {
    console.error('Error querying transactions:', err);
  } else if (transactions && transactions.length) {
    console.log('=== Found Transactions with Amount 20000 ===');
    transactions.forEach(t => {
      console.log(JSON.stringify(t, null, 2));
      console.log('---');
    });
    
    // For each transaction, find the account and user
    if (transactions[0]) {
      const accountId = transactions[0].account_id;
      console.log('\n=== Account Details ===');
      
      db.get('SELECT * FROM savings_accounts WHERE id = ?', [accountId], (err, account) => {
        if (account) {
          console.log(`Account ID: ${account.id}`);
          console.log(`User ID: ${account.user_id}`);
          console.log(`Balance: ${account.balance}`);
          
          // Get user email
          db.get('SELECT username, email FROM users WHERE id = ?', [account.user_id], (err, user) => {
            if (user) {
              console.log(`\nUser: ${user.username} | Email: ${user.email}`);
              
              // Check for notification emails
              db.all('SELECT recipient_email, subject, status, sent_at FROM email_log WHERE recipient_email = ? ORDER BY sent_at DESC LIMIT 10', 
                [user.email], (err, emails) => {
                console.log('\n=== Email Log for this User ===');
                if (emails && emails.length) {
                  emails.forEach(e => console.log(`[${e.status}] ${new Date(e.sent_at).toLocaleString()} - ${e.subject}`));
                } else {
                  console.log('No emails found');
                }
                db.close();
              });
            } else {
              console.log('User not found');
              db.close();
            }
          });
        }
      });
    }
  } else {
    console.log('No transactions with amount 20000 found');
    
    // Check for user 8 directly and see what transactions exist
    console.log('\n=== Checking all accounts ===');
    db.all('SELECT id, user_id, account_number FROM savings_accounts LIMIT 5', (err, accounts) => {
      if (accounts && accounts.length) {
        console.log('Sample accounts:', accounts);
      }
      
      // Check all transactions in last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      db.all('SELECT * FROM transactions WHERE created_at > ? ORDER BY created_at DESC LIMIT 10', [yesterday], (err, recent) => {
        console.log('\n=== Recent Transactions (last 24h) ===');
        if (recent && recent.length) {
          recent.forEach(t => {
            console.log(`Amount: ${t.amount} | Type: ${t.transaction_type} | Status: ${t.status} | Created: ${t.created_at}`);
          });
        } else {
          console.log('No recent transactions');
        }
        db.close();
      });
    });
  }
});
