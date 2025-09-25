import { trackersConf } from '@server/shared/trackers-conf';
import type { TrackerConf } from '@server/shared/types';
import { authFns } from './tracker-data.auth.fns';
import type { TrackerAuthParams } from './tracker-data.types';

export class TrackerAuth {
  private cookies: string = '';
  private login: string;
  private password: string;
  private tracker: keyof typeof trackersConf;
  private baseUrl: string;
  private tConf: TrackerConf;
  private authFn: (typeof authFns)[keyof typeof authFns];
  constructor({ login, password, baseUrl, tracker }: TrackerAuthParams) {
    const tConf = trackersConf[tracker];
    if (!tConf) throw new Error('Tracker not found');
    this.tConf = tConf;
    this.login = login;
    this.password = password;
    this.baseUrl = baseUrl;
    this.tracker = tracker;
    this.authFn = authFns[this.tracker as keyof typeof authFns];
  }

  public async getCookies() {
    if (!this.tConf.authPath) throw new Error('Auth path not found');
    try {
      this.cookies = await this.authFn(
        this.login,
        this.password,
        this.baseUrl,
        this.tConf.authPath
      );
      if (!this.cookies) throw new Error('No cookies found');
      return this.cookies;
    } catch (e) {
      throw new Error(`Failed to authenticate ${this.tracker} with ${e}`);
    }
  }
}
