import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('bot_database.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT DEFAULT 'N/A',
    range_code TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    user_id INTEGER PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    number TEXT NOT NULL,
    service_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    otp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Simple Migration: Add country if it doesn't exist
try {
  db.prepare('SELECT country FROM services LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE services ADD COLUMN country TEXT DEFAULT "N/A"');
}

export interface Service {
  id: number;
  name: string;
  country: string;
  range_code: string;
}

export const db_helper = {
  // Settings management
  setSetting: (key: string, value: string) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    return stmt.run(key, value);
  },
  getSetting: (key: string): string | null => {
    const res = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return res ? res.value : null;
  },
  // Service management
  addService: (name: string, range_code: string, country: string = 'N/A') => {
    const stmt = db.prepare('INSERT INTO services (name, range_code, country) VALUES (?, ?, ?)');
    return stmt.run(name, range_code, country);
  },
  getServices: (): Service[] => {
    return db.prepare('SELECT * FROM services').all() as Service[];
  },
  deleteService: (id: number) => {
    return db.prepare('DELETE FROM services WHERE id = ?').run(id);
  },

  // Admin management
  addAdmin: (user_id: number) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO admins (user_id) VALUES (?)');
    return stmt.run(user_id);
  },
  isAdmin: (user_id: number): boolean => {
    const admin = db.prepare('SELECT * FROM admins WHERE user_id = ?').get(user_id);
    return !!admin;
  },
  getAdmins: (): number[] => {
    return db.prepare('SELECT user_id FROM admins').all().map((a: any) => a.user_id);
  },

  // Order management
  createOrder: (id: string, user_id: number, number: string, service_name: string) => {
    const stmt = db.prepare('INSERT INTO orders (id, user_id, number, service_name) VALUES (?, ?, ?, ?)');
    return stmt.run(id, user_id, number, service_name);
  },
  updateOrderOtp: (id: string, otp: string) => {
    const stmt = db.prepare('UPDATE orders SET otp = ?, status = "completed" WHERE id = ?');
    return stmt.run(otp, id);
  },
  getPendingOrders: () => {
    return db.prepare('SELECT * FROM orders WHERE status = "pending"').all();
  },

  // User tracking
  addUser: (user_id: number) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)');
    return stmt.run(user_id);
  },
  getUsersCount: (): number => {
    const res = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return res.count;
  },
  getServicesCount: (): number => {
    const res = db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number };
    return res.count;
  },
  getAllUsers: (): number[] => {
    return db.prepare('SELECT user_id FROM users').all().map((u: any) => u.user_id);
  },
  deleteSetting: (key: string) => {
    const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
    return stmt.run(key);
  }
};
