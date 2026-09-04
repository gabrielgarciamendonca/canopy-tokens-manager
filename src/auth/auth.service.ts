import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user';

const BCRYPT_ROUNDS = 12;

export type AuthTokenResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthTokenResponse> {
    const normalized = normalizeEmail(email);
    if (this.users.findByEmail(normalized)) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = this.users.create(normalized, passwordHash);
    return this.issue(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthTokenResponse> {
    const normalized = normalizeEmail(email);
    const user = this.users.findByEmail(normalized);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }

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
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
