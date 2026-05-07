import { Role } from '@prisma/client';

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role?: Role;
}
