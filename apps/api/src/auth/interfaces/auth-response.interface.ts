import { SafeUser } from '../../users/interfaces/safe-user.interface';

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: SafeUser;
}
