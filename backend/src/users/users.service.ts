import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValidUsername, normalizeUsername } from './username.util';

export interface CreateUserInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role?: Role;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username: normalizeUsername(username) },
    });
  }

  async create(data: CreateUserInput): Promise<User> {
    const username = normalizeUsername(data.username);
    if (!isValidUsername(username)) {
      throw new ConflictException('Username inválido.');
    }

    const existingUsername = await this.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Não foi possível concluir o registro.');
    }

    const payload: Prisma.UserCreateInput = {
      username,
      displayName: data.displayName.trim(),
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role ?? Role.USER,
    };
    return this.prisma.user.create({ data: payload });
  }
}
