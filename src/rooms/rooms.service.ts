import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { DatabaseService } from '../db/database.service';
import type { PublicUser } from '../users/user';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

type RoomRow = {
  code: string;
  hostId: string;
  guestId: string | null;
  offer: string;
  answer: string | null;
  createdAt: string;
  expiresAt: string;
};

@Injectable()
export class RoomsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  create(host: PublicUser, offer: string) {
    this.purgeExpired();
    const now = Date.now();
    const ttlSeconds = Number(this.config.get('ROOM_TTL_SECONDS') ?? 900);
    const room: RoomRow = {
      code: this.allocateCode(),
      hostId: host.id,
      guestId: null,
      offer,
      answer: null,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    };
    this.database.connection
      .prepare(
        `INSERT INTO rooms (code, host_id, guest_id, offer, answer, created_at, expires_at)
         VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
      )
      .run(room.code, room.hostId, room.offer, room.createdAt, room.expiresAt);

    return {
      code: room.code,
      expiresAt: room.expiresAt,
    };
  }

  getOffer(code: string) {
    const room = this.requireLive(code);
    return {
      code: room.code,
      offer: room.offer,
      expiresAt: room.expiresAt,
      hasAnswer: room.answer !== null,
    };
  }

  submitAnswer(code: string, guest: PublicUser, answer: string) {
    const room = this.requireLive(code);
    if (room.hostId === guest.id) {
      throw new ForbiddenException('The host cannot submit the answer.');
    }
    if (room.answer) {
      throw new ConflictException('This room already has an answer.');
    }

    this.database.connection
      .prepare('UPDATE rooms SET answer = ?, guest_id = ? WHERE code = ?')
      .run(answer, guest.id, room.code);

    return {
      code: room.code,
      expiresAt: room.expiresAt,
      accepted: true,
    };
  }

  getAnswer(code: string, requester: PublicUser) {
    const room = this.requireLive(code);
    if (room.hostId !== requester.id) {
      throw new ForbiddenException('Only the host can read the answer.');
    }
    if (!room.answer) {
      return {
        code: room.code,
        answer: null,
        expiresAt: room.expiresAt,
      };
    }

    return {
      code: room.code,
      answer: room.answer,
      expiresAt: room.expiresAt,
    };
  }

  private requireLive(code: string): RoomRow {
    this.purgeExpired();
    const room = this.database.connection
      .prepare(
        `SELECT code, host_id AS hostId, guest_id AS guestId, offer, answer,
                created_at AS createdAt, expires_at AS expiresAt
         FROM rooms WHERE code = ?`,
      )
      .get(normalizeCode(code)) as RoomRow | undefined;

    if (!room) {
      throw new NotFoundException('Room not found.');
    }
    if (Date.parse(room.expiresAt) <= Date.now()) {
      this.database.connection.prepare('DELETE FROM rooms WHERE code = ?').run(room.code);
      throw new GoneException('This room expired. Create a new invite.');
    }
    return room;
  }

  private allocateCode(): string {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = randomRoomCode();
      const exists = this.database.connection
        .prepare('SELECT 1 FROM rooms WHERE code = ?')
        .get(code);
      if (!exists) {
        return code;
      }
    }
    throw new ConflictException('Could not allocate a room code.');
  }

  private purgeExpired() {
    this.database.connection
      .prepare('DELETE FROM rooms WHERE expires_at <= ?')
      .run(new Date().toISOString());
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function randomRoomCode(): string {
  const chunk = (size: number) => {
    let text = '';
    for (let i = 0; i < size; i++) {
      text += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return text;
  };
  return `CN-${chunk(4)}-${chunk(4)}`;
}
