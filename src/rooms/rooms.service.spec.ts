import { randomRoomCode } from './rooms.service';

describe('RoomsService helpers', () => {
  it('allocates CN-XXXX-XXXX codes without ambiguous letters', () => {
    const code = randomRoomCode();
    expect(code).toMatch(/^CN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    expect(code).not.toMatch(/[01ILOU]/);
  });
});
