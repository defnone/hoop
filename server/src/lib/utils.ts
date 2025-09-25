import db from '@server/db';
import logger from './logger';
import { user, verification } from '@server/db/auth/auth-schema';
import { and, eq, lt, desc, asc } from 'drizzle-orm';
import type { EmailOTPOptions } from 'better-auth/plugins/email-otp';
import { usersCountStorage } from './users-count-storage';

export { usersCountStorage };

export async function getUserCount() {
  if (!usersCountStorage.get('count')) {
    const users = await db.$count(user);
    usersCountStorage.set('count', users);
    logger.debug(
      `[usersStateStorage] Users count: ${usersCountStorage.get('count')}`
    );
    return users ?? 1;
  }
}

export async function sendVerificationOTP(
  data: Parameters<EmailOTPOptions['sendVerificationOTP']>[0]
) {
  if (data.type !== 'forget-password') return;
  console.log(data);
  const dbData = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, 'reset-password-' + data.email))
    .orderBy(asc(verification.expiresAt));

  if (dbData.length > 1 && dbData[0] && dbData[0]?.expiresAt > new Date()) {
    logger.warn('OTP already sent within the last 5 minutes.');
    return;
  } else {
    if (dbData.length > 1) {
      await db.delete(verification).where(
        and(
          eq(verification.identifier, 'reset-password-' + data.email),
          lt(
            verification.expiresAt,
            db
              .select({ expiresAt: verification.expiresAt })
              .from(verification)
              .where(
                eq(verification.identifier, 'reset-password-' + data.email)
              )
              .orderBy(desc(verification.expiresAt))
              .limit(1)
          )
        )
      );
    }

    console.log(data.otp);
  }
}

export function normalizeBaseUrl(hostOrUrl: string): string {
  const candidate = hostOrUrl.startsWith('http')
    ? hostOrUrl
    : `https://${hostOrUrl}`;

  try {
    return new URL(candidate).origin;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to normalize base URL from ${hostOrUrl}: ${detail}`);
  }
}
