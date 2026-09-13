import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'app.db');
const SQL_PATH = path.join(process.cwd(), 'data', 'seed.sql');

const db = new Database(DB_PATH);
const sql = fs.readFileSync(SQL_PATH, 'utf-8');

db.exec(sql);
console.log(`Seeded database at ${DB_PATH}`);
db.close();
