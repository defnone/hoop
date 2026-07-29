import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import db, { sqlite } from '../db';
// import { emailOTP } from 'better-auth/plugins';
// import { sendVerificationOTP } from './utils';
import * as schema from '../db/auth/auth-schema';
import { onAfterUserCreate } from './auth-hooks';
import { SingleUserSignup } from './single-user-signup';
import { SqliteSingleUserSignupDatabase } from '@server/db/single-user-signup-database';

const authBaseUrl = process.env.ORIGIN || 'http://localhost:5173';

export const auth = betterAuth({
  baseURL: authBaseUrl,

  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema,
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/email-otp/send-verification-otp': {
        window: 60,
        max: 3,
      },
    },
  },

  trustedOrigins: [authBaseUrl],

  databaseHooks: {
    user: {
      create: {
        after: onAfterUserCreate,
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
  },

  // plugins: [
  //   emailOTP({
  //     sendVerificationOTP,
  //     allowedAttempts: 5,
  //     expiresIn: 300,
  //     disableSignUp: true,
  //   }),
  // ],
});

const singleUserSignup = new SingleUserSignup(
  new SqliteSingleUserSignupDatabase(sqlite),
);

export async function handleAuthRequest(request: Request): Promise<Response> {
  return singleUserSignup.handle(request, () => auth.handler(request));
}
