import { trackersConf } from '@server/shared/trackers-conf';
import type { TrackerConf } from '@server/shared/types';
import { authFns } from './tracker-data.auth.fns';
import { CloudflareChallengeError } from './utils';
import type {
  TrackerAuthParams,
  TrackerAuthRequestOptions,
} from './tracker-data.types';

export type TrackerAuthErrorKind =
  | 'configuration'
  | 'credentials'
  | 'challenge'
  | 'transport';

export class TrackerAuthError extends Error {
  public readonly kind: TrackerAuthErrorKind;
  public readonly retryable: boolean;

  constructor(message: string, kind: TrackerAuthErrorKind, cause?: Error) {
    super(message, { cause });
    this.name = 'TrackerAuthError';
    this.kind = kind;
    this.retryable = kind === 'transport';
  }
}

export class TrackerAuth {
  private cookies: string = '';
  private login: string;
  private password: string;
  private tracker: keyof typeof trackersConf;
  private baseUrlValue: string;
  private originValue: string;
  private tConf: TrackerConf;
  private authFn: (typeof authFns)[keyof typeof authFns];
  constructor({ login, password, baseUrl, tracker }: TrackerAuthParams) {
    const tConf = trackersConf[tracker];
    if (!tConf) throw new Error('Tracker not found');
    this.tConf = tConf;
    this.login = login;
    this.password = password;
    this.baseUrlValue = baseUrl;
    this.originValue = new URL(baseUrl).origin;
    this.tracker = tracker;
    this.authFn = authFns[this.tracker as keyof typeof authFns];
  }

  public get baseUrl(): string {
    return this.baseUrlValue;
  }

  public get origin(): string {
    return this.originValue;
  }

  public async getCookies(
    requestOptions: TrackerAuthRequestOptions = {},
  ): Promise<string> {
    if (!this.tConf.authPath) {
      throw new TrackerAuthError('Auth path not found', 'configuration');
    }

    try {
      this.cookies =
        Object.keys(requestOptions).length > 0
          ? await this.authFn(
              this.login,
              this.password,
              this.baseUrlValue,
              this.tConf.authPath,
              requestOptions,
            )
          : await this.authFn(
              this.login,
              this.password,
              this.baseUrlValue,
              this.tConf.authPath,
            );
      if (!this.cookies) {
        throw new TrackerAuthError('No cookies found', 'credentials');
      }
      return this.cookies;
    } catch (error) {
      if (error instanceof TrackerAuthError) {
        throw error;
      }

      const cause = error instanceof Error ? error : new Error(String(error));
      const kind =
        cause instanceof CloudflareChallengeError
          ? 'challenge'
          : cause.message === 'No cookies found'
            ? 'credentials'
            : 'transport';
      throw new TrackerAuthError(
        kind === 'challenge'
          ? `Cloudflare challenge detected while authenticating ${this.tracker}`
          : `Failed to authenticate ${this.tracker} with ${cause}`,
        kind,
        cause,
      );
    }
  }
}
