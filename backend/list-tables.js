require('dotenv').config();
const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('./database.sqlite');

db.all('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name', (err, tables) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  console.log('=== All Tables ===');
  tables.forEach(t => console.log(t.name));
  db.close();
});
