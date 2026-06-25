import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';

const AUTH_BASE_URL: string = import.meta.env.VITE_BACKEND_URL ?? '';

const authClient = createAuthClient({
  plugins: [emailOTPClient()],
  baseURL: AUTH_BASE_URL,
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  changePassword,
  changeEmail,
} = authClient;
