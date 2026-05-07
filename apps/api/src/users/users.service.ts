import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput } from './interfaces/create-user.input';
import { SafeUser } from './interfaces/safe-user.interface';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: CreateUserInput): Promise<SafeUser> {
    const passwordHash = await argon2.hash(input.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          username: input.username,
          email: input.email.toLowerCase(),
          passwordHash,
          role: input.role,
        },
      });

      return this.toSafeUser(user);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByAccount(account: string): Promise<User | null> {
    const normalizedAccount = account.trim();

    return this.prisma.user.findFirst({
      where: {
        OR: [
          { username: normalizedAccount },
          { email: normalizedAccount.toLowerCase() },
        ],
      },
    });
  }

  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Username or email already exists');
    }

    throw error;
  }
}
