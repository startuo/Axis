import { Role } from '@prisma/client';

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
