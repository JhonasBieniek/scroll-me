import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return {
    ...actual,
    compare: jest.fn((data: string, encrypted: string) =>
      actual.compare(data, encrypted),
    ),
    hash: jest.fn((data: string | Buffer, saltOrRounds: string | number) =>
      actual.hash(data, saltOrRounds),
    ),
  };
});

const mockedCompare = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'create'>
  >;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;

  const baseUser: User = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'devuser',
    displayName: 'Dev User',
    email: 'dev@scroll.me',
    passwordHash: '',
    authProvider: 'LOCAL',
    githubId: null,
    bio: null,
    avatarKey: null,
    role: Role.USER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
      get: jest.fn().mockImplementation((_key: string, def?: string) => def),
    } as unknown as ConfigService;

    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      config,
    );
  });

  describe('register', () => {
    it('cria usuário, faz hash da senha e retorna tokens', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation(({ email, passwordHash }) =>
        Promise.resolve({ ...baseUser, email, passwordHash }),
      );

      const result = await service.register({
        username: 'devuser',
        displayName: 'Dev User',
        email: 'dev@scroll.me',
        password: 'senhaForte123',
      });

      expect(users.create).toHaveBeenCalledTimes(1);
      const createArg = users.create.mock.calls[0][0];
      expect(createArg.passwordHash).not.toBe('senhaForte123');
      await expect(
        bcrypt.compare('senhaForte123', createArg.passwordHash),
      ).resolves.toBe(true);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: baseUser.id,
        username: 'devuser',
        displayName: 'Dev User',
        email: 'dev@scroll.me',
        bio: null,
        avatarKey: null,
        role: Role.USER,
        createdAt: baseUser.createdAt,
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejeita e-mail já cadastrado com ConflictException', async () => {
      users.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.register({
          username: 'devuser',
          displayName: 'Dev User',
          email: 'dev@scroll.me',
          password: 'senhaForte123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('autentica com senha correta', async () => {
      const passwordHash = await bcrypt.hash('senhaForte123', 10);
      users.findByEmail.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.login({
        email: 'dev@scroll.me',
        password: 'senhaForte123',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.email).toBe('dev@scroll.me');
    });

    it('rejeita senha incorreta com mensagem genérica', async () => {
      const passwordHash = await bcrypt.hash('senhaCorreta', 10);
      users.findByEmail.mockResolvedValue({ ...baseUser, passwordHash });

      await expect(
        service.login({ email: 'dev@scroll.me', password: 'errada' }),
      ).rejects.toMatchObject({ message: 'Credenciais inválidas.' });
    });

    it('rejeita e-mail inexistente sem vazar enumeração', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ninguem@scroll.me', password: 'qualquer' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita conta sem senha local sem chamar bcrypt.compare', async () => {
      users.findByEmail.mockResolvedValue(null);
      mockedCompare.mockClear();

      await expect(
        service.login({ email: 'ninguem@scroll.me', password: 'qualquer' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockedCompare).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('emite novos tokens para usuário válido', async () => {
      users.findById.mockResolvedValue(baseUser);

      const result = await service.refresh(baseUser.id);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe(baseUser.id);
    });

    it('rejeita usuário inexistente', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('inexistente')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
