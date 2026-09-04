import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../db/database.service';
import { PublicUser, UserRecord } from './user';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  create(email: string, passwordHash: string): UserRecord {
    const user: UserRecord = {
      id: randomUUID(),
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.database.connection
      .prepare(
        'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(user.id, user.email, user.passwordHash, user.createdAt);
    return user;
  }

  findByEmail(email: string): UserRecord | undefined {
    const row = this.database.connection
      .prepare(
        'SELECT id, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE email = ?',
      )
      .get(email) as UserRecord | undefined;
    return row;
  }

  findById(id: string): UserRecord | undefined {
    const row = this.database.connection
      .prepare(
        'SELECT id, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?',
      )
      .get(id) as UserRecord | undefined;
    return row;
  }

  toPublic(user: UserRecord): PublicUser {
    return { id: user.id, email: user.email };
  }
}
