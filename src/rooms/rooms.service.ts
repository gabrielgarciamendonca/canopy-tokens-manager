import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import { DatabaseService } from '../db/database.service';
import type { PublicUser } from '../users/user';
import { UsersService } from '../users/users.service';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_ROOM_MEMBERS = 10;
const MAX_JOINS = MAX_ROOM_MEMBERS - 1;

type JoinRow = {
  id: string;
  roomCode: string;
  guestId: string;
  offer: string;
  answer: string | null;
  createdAt: string;
};

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
    private readonly users: UsersService,
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

  remove(code: string, requester: PublicUser) {
    this.purgeExpired();
    const room = this.database.connection
      .prepare(
        `SELECT code, host_id AS hostId, guest_id AS guestId, offer, answer,
                created_at AS createdAt, expires_at AS expiresAt
         FROM rooms WHERE code = ?`,
      )
      .get(normalizeCode(code)) as RoomRow | undefined;

    if (!room) {
      return { deleted: false };
    }
    if (room.hostId !== requester.id && room.guestId !== requester.id) {
      throw new ForbiddenException('You cannot discard this room.');
    }

    this.deleteJoins(room.code);
    this.database.connection.prepare('DELETE FROM rooms WHERE code = ?').run(room.code);
    return { deleted: true };
  }

  removeMine(requester: PublicUser) {
    this.purgeExpired();
    this.database.connection
      .prepare(
        `DELETE FROM room_joins WHERE room_code IN (
           SELECT code FROM rooms WHERE host_id = ? OR guest_id = ?
         )`,
      )
      .run(requester.id, requester.id);
    const result = this.database.connection
      .prepare('DELETE FROM rooms WHERE host_id = ? OR guest_id = ?')
      .run(requester.id, requester.id);
    return { deleted: Number(result.changes ?? 0) };
  }

  submitJoin(code: string, guest: PublicUser, offer: string) {
    const room = this.requireLive(code);
    if (room.hostId === guest.id) {
      throw new ForbiddenException('The host cannot join their own room.');
    }

    const existing = this.database.connection
      .prepare(
        `SELECT id, room_code AS roomCode, guest_id AS guestId, offer, answer,
                created_at AS createdAt
         FROM room_joins WHERE room_code = ? AND guest_id = ?`,
      )
      .get(room.code, guest.id) as JoinRow | undefined;

    if (existing?.answer) {
      throw new ConflictException('You already joined this room.');
    }

    if (existing) {
      this.database.connection
        .prepare('UPDATE room_joins SET offer = ? WHERE id = ?')
        .run(offer, existing.id);
      return { id: existing.id, expiresAt: room.expiresAt };
    }

    const count = Number(
      (
        this.database.connection
          .prepare('SELECT COUNT(*) AS n FROM room_joins WHERE room_code = ?')
          .get(room.code) as { n: number }
      ).n,
    );
    if (count >= MAX_JOINS) {
      throw new ConflictException(`This room is full (${MAX_ROOM_MEMBERS} people).`);
    }

    const id = randomUUID();
    this.database.connection
      .prepare(
        `INSERT INTO room_joins (id, room_code, guest_id, offer, answer, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .run(id, room.code, guest.id, offer, new Date().toISOString());

    return { id, expiresAt: room.expiresAt };
  }

  listJoins(code: string, requester: PublicUser) {
    const room = this.requireLive(code);
    if (room.hostId !== requester.id) {
      throw new ForbiddenException('Only the host can list joins.');
    }

    const rows = this.database.connection
      .prepare(
        `SELECT id, room_code AS roomCode, guest_id AS guestId, offer, answer,
                created_at AS createdAt
         FROM room_joins WHERE room_code = ? ORDER BY created_at ASC`,
      )
      .all(room.code) as JoinRow[];

    return {
      code: room.code,
      expiresAt: room.expiresAt,
      joins: rows.map((row) => ({
        id: row.id,
        guestEmail: this.users.findById(row.guestId)?.email ?? null,
        hasAnswer: row.answer !== null,
        createdAt: row.createdAt,
        offer: row.answer ? null : row.offer,
      })),
    };
  }

  getJoin(code: string, joinId: string, requester: PublicUser) {
    const room = this.requireLive(code);
    const join = this.requireJoin(room.code, joinId);
    if (room.hostId !== requester.id && join.guestId !== requester.id) {
      throw new ForbiddenException('You cannot read this join.');
    }

    return {
      id: join.id,
      expiresAt: room.expiresAt,
      hasAnswer: join.answer !== null,
      offer: room.hostId === requester.id && !join.answer ? join.offer : null,
      answer: join.guestId === requester.id || room.hostId === requester.id ? join.answer : null,
    };
  }

  submitJoinAnswer(code: string, joinId: string, host: PublicUser, answer: string) {
    const room = this.requireLive(code);
    if (room.hostId !== host.id) {
      throw new ForbiddenException('Only the host can answer a join.');
    }

    const join = this.requireJoin(room.code, joinId);
    if (join.answer) {
      throw new ConflictException('This join already has an answer.');
    }

    this.database.connection
      .prepare('UPDATE room_joins SET answer = ? WHERE id = ?')
      .run(answer, join.id);

    return {
      id: join.id,
      expiresAt: room.expiresAt,
      accepted: true,
    };
  }

  getAnswer(code: string, requester: PublicUser) {
    const room = this.requireLive(code);
    if (room.hostId !== requester.id) {
      throw new ForbiddenException('Only the host can read the answer.');
    }
    const guestEmail = room.guestId
      ? this.users.findById(room.guestId)?.email ?? null
      : null;

    if (!room.answer) {
      return {
        code: room.code,
        answer: null,
        guestEmail: null,
        expiresAt: room.expiresAt,
      };
    }

    return {
      code: room.code,
      answer: room.answer,
      guestEmail,
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
      this.deleteJoins(room.code);
      this.database.connection.prepare('DELETE FROM rooms WHERE code = ?').run(room.code);
      throw new GoneException('This room expired. Create a new invite.');
    }
    return room;
  }

  private requireJoin(roomCode: string, joinId: string): JoinRow {
    const join = this.database.connection
      .prepare(
        `SELECT id, room_code AS roomCode, guest_id AS guestId, offer, answer,
                created_at AS createdAt
         FROM room_joins WHERE id = ? AND room_code = ?`,
      )
      .get(joinId, roomCode) as JoinRow | undefined;
    if (!join) {
      throw new NotFoundException('Join not found.');
    }
    return join;
  }

  private deleteJoins(roomCode: string) {
    this.database.connection.prepare('DELETE FROM room_joins WHERE room_code = ?').run(roomCode);
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
    const now = new Date().toISOString();
    this.database.connection
      .prepare(
        `DELETE FROM room_joins WHERE room_code IN (
           SELECT code FROM rooms WHERE expires_at <= ?
         )`,
      )
      .run(now);
    this.database.connection.prepare('DELETE FROM rooms WHERE expires_at <= ?').run(now);
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
