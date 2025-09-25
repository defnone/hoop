import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import db from '../db';
// import { emailOTP } from 'better-auth/plugins';
// import { sendVerificationOTP } from './utils';
import * as schema from '../db/auth/auth-schema';
import { onAfterUserCreate, onBeforeUserCreate } from './auth-hooks';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { usersCountStorage } from './users-count-storage';

export const auth = betterAuth({
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

  trustedOrigins: [process.env.ORIGIN || 'http://localhost:5173'],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // This hook is implemented to prevent attempts to guess a user's email during sign-up by brute force.
      if (
        ctx.path === '/sign-up/email' &&
        (usersCountStorage.get('count') ?? 1) > 0
      ) {
        throw new APIError('FORBIDDEN', {
          message: 'Sign-up disabled',
        });
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        before: onBeforeUserCreate,
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
