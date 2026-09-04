import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../db/database.service';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user';
import { MailService } from './mail.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

export type AuthTokenResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: PublicUser;
};

export type RequestCodeResponse = {
  ok: true;
  expiresInSeconds: number;
  devCode?: string;
};

type LoginCodeRow = {
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async requestCode(email: string): Promise<RequestCodeResponse> {
    const normalized = normalizeEmail(email);
    const now = Date.now();
    const existing = this.readCode(normalized);
    if (existing && Date.parse(existing.createdAt) + RESEND_COOLDOWN_MS > now) {
      throw new HttpException('Wait a moment before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
    this.database.connection
      .prepare(
        `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at)
         VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(email) DO UPDATE SET
           code_hash = excluded.code_hash,
           expires_at = excluded.expires_at,
           attempts = 0,
           created_at = excluded.created_at`,
      )
      .run(normalized, hashCode(normalized, code, this.secret()), expiresAt, createdAt);

    await this.mail.sendLoginCode(normalized, code);

    const response: RequestCodeResponse = { ok: true, expiresInSeconds: CODE_TTL_MS / 1000 };
    if (this.mail.allowDevInbox()) {
      response.devCode = code;
    }
    return response;
  }

  async verifyCode(email: string, code: string): Promise<AuthTokenResponse> {
    const normalized = normalizeEmail(email);
    const digits = code.replace(/\D/g, '');
    const row = this.readCode(normalized);
    if (!row || Date.parse(row.expiresAt) <= Date.now()) {
      this.deleteCode(normalized);
      throw new UnauthorizedException('Invalid or expired code.');
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      this.deleteCode(normalized);
      throw new UnauthorizedException('Too many attempts. Request a new code.');
    }

    const expected = Buffer.from(row.codeHash, 'hex');
    const actual = Buffer.from(hashCode(normalized, digits, this.secret()), 'hex');
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matches) {
      this.database.connection
        .prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?')
        .run(normalized);
      throw new UnauthorizedException('Invalid or expired code.');
    }

    this.deleteCode(normalized);
    const user = this.users.findByEmail(normalized) ?? this.users.create(normalized, '');
    return this.issue(user.id, user.email);
  }

  me(userId: string): PublicUser {
    const user = this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.users.toPublic(user);
  }

  private issue(userId: string, email: string): AuthTokenResponse {
    return {
      accessToken: this.jwt.sign({ sub: userId, email }),
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
      user: { id: userId, email },
    };
  }

  private secret(): string {
    return this.config.get<string>('JWT_SECRET') ?? 'dev';
  }

  private readCode(email: string): LoginCodeRow | undefined {
    return this.database.connection
      .prepare(
        `SELECT email, code_hash AS codeHash, expires_at AS expiresAt,
                attempts, created_at AS createdAt
         FROM login_codes WHERE email = ?`,
      )
      .get(email) as LoginCodeRow | undefined;
  }

  private deleteCode(email: string) {
    this.database.connection.prepare('DELETE FROM login_codes WHERE email = ?').run(email);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashCode(email: string, code: string, secret: string): string {
  return createHash('sha256').update(`${email}:${code}:${secret}`).digest('hex');
}
