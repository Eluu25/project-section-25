require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

console.log('=== Savings Accounts Schema ===\n');

db.all('PRAGMA table_info(savings_accounts)', (err, columns) => {
  if (columns) {
    columns.forEach(col => {
      console.log(`${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
    });
  }

  console.log('\n=== Account SV-1783440165816 Details ===\n');
  
  db.get('SELECT * FROM savings_accounts WHERE id = ?', ['SV-1783440165816'], (err, account) => {
    if (account) {
      console.log(JSON.stringify(account, null, 2));
    } else {
      console.log('Account not found');
    }
    
    // Try to link transaction to user via clients table
    console.log('\n=== Checking Clients Table ===\n');
    
    db.all('PRAGMA table_info(clients)', (err, cols) => {
      if (cols) {
        cols.forEach(col => {
          console.log(`${col.name} (${col.type})`);
        });
      }
      
      // Find account linked to client
      db.all('SELECT * FROM clients WHERE savings_account_id = ? OR account_id = ?', ['SV-1783440165816', 'SV-1783440165816'], (err, clients) => {
        if (clients && clients.length) {
          console.log('\n=== Linked Client ===');
          console.log(JSON.stringify(clients[0], null, 2));
        } else {
          console.log('\nNo linked client found - this is the problem!');
        }
        db.close();
      });
    });
  });
});
