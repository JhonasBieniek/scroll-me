import { normalizeUsername, isValidUsername } from './username.util';

describe('username.util', () => {
  describe('normalizeUsername', () => {
    it('remove espaços e converte para minúsculas', () => {
      expect(normalizeUsername('  Dev_User  ')).toBe('dev_user');
    });
  });

  describe('isValidUsername', () => {
    it('aceita usernames válidos', () => {
      expect(isValidUsername('dev_user')).toBe(true);
      expect(isValidUsername('user.name')).toBe(true);
      expect(isValidUsername('abc')).toBe(true);
    });

    it('rejeita formatos inválidos', () => {
      expect(isValidUsername('ab')).toBe(false);
      expect(isValidUsername('user-name')).toBe(false);
      expect(isValidUsername('UPPER')).toBe(false);
      expect(isValidUsername('a'.repeat(31))).toBe(false);
    });
  });
});
