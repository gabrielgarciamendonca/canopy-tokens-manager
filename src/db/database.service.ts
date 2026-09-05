import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const configured = this.config.get<string>('DATABASE_PATH') ?? process.env.DATABASE_PATH;
    const path = resolveDatabasePath(configured);
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new Database(path);
    if (path !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_codes (
        email TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        guest_id TEXT,
        offer TEXT NOT NULL,
        answer TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (host_id) REFERENCES users(id),
        FOREIGN KEY (guest_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS room_joins (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        offer TEXT NOT NULL,
        answer TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
        FOREIGN KEY (guest_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_room_joins_code ON room_joins(room_code);
    `);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  get connection(): Database.Database {
    return this.db;
  }
}

function resolveDatabasePath(configured: string | undefined): string {
  const raw = configured?.trim();
  if (!raw || raw.includes('\\') || /^[A-Za-z]:/.test(raw)) {
    return 'signaling.sqlite';
  }
  return raw;
}
