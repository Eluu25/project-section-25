require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

const userId = 8;

console.log('=== Looking for accounts for user ID', userId, '===\n');

// Check savings_accounts
db.all('SELECT id, user_id, account_number, balance FROM savings_accounts WHERE user_id = ?', [userId], (err, savings) => {
  if (savings && savings.length) {
    console.log('=== Savings Accounts ===');
    savings.forEach(acc => {
      console.log(`\nAccount ID: ${acc.id}`);
      console.log(`Account Number: ${acc.account_number}`);
      console.log(`Balance: ${acc.balance}`);
    });
    
    // Get transactions for first account
    if (savings[0]) {
      db.all('SELECT id, account_id, transaction_type, amount, balance_after, status, created_at FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 10', 
        [savings[0].id], (err, transactions) => {
        console.log('\n=== Recent Transactions for this Account ===');
        if (transactions && transactions.length) {
          transactions.forEach(t => {
            console.log(`\n[${t.status}] ${new Date(t.created_at).toLocaleString()}`);
            console.log(`Type: ${t.transaction_type} | Amount: ${t.amount}`);
            console.log(`Balance After: ${t.balance_after}`);
          });
        } else {
          console.log('No transactions found');
        }
        
        // Check for notification emails
        db.all('SELECT recipient_email, subject, status, sent_at FROM email_log WHERE recipient_email = ? ORDER BY sent_at DESC LIMIT 15', 
          ['hasetsiraj369@gmail.com'], (err, emails) => {
          console.log('\n=== Recent Emails for this User ===');
          if (emails && emails.length) {
            emails.forEach(e => console.log(`[${e.status}] ${new Date(e.sent_at).toLocaleString()} - ${e.subject}`));
          }
          db.close();
        });
      });
    } else {
      db.close();
    }
  } else {
    console.log('No savings accounts found');
    db.close();
  }
});
