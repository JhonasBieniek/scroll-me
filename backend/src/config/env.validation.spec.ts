import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('fails when required vars are missing', () => {
    expect(() => validateEnv({})).toThrow(
      /Variáveis de ambiente obrigatórias ausentes: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET/,
    );
  });

  it('fails when JWT secrets are blank', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL:
          'postgresql://scrollme:scrollme@localhost:5432/scrollme_v2',
        JWT_ACCESS_SECRET: '   ',
        JWT_REFRESH_SECRET: '',
      }),
    ).toThrow(/JWT_ACCESS_SECRET, JWT_REFRESH_SECRET/);
  });

  it('returns config when all required vars are present', () => {
    const config = {
      DATABASE_URL: 'postgresql://scrollme:scrollme@localhost:5432/scrollme_v2',
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
    };

    expect(validateEnv(config)).toEqual(config);
  });
});
