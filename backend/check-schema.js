require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

console.log('=== Transactions Table Schema ===\n');

db.all('PRAGMA table_info(transactions)', (err, columns) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  if (columns) {
    columns.forEach(col => {
      console.log(`${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
    });
  }

  console.log('\n=== Recent Transactions for User ID 8 ===\n');
  
  db.all('SELECT * FROM transactions WHERE client_id = 8 ORDER BY created_at DESC LIMIT 5', (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else if (rows && rows.length) {
      rows.forEach(row => {
        console.log(JSON.stringify(row, null, 2));
        console.log('---');
      });
    } else {
      console.log('No transactions found for this user');
    }
    db.close();
  });
});
