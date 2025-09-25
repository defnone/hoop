import type { DbUserSettings } from '@server/db/app/app-schema';

type TrackerConfBase = {
  urls: string[];
  titleSelector: string;
  showTitle: (title: string) => string | undefined;
  isDifferentMagnetUrl: boolean;
  magnetUrl: ((protocol: string, host: string, id: string) => URL) | null;
  magnetSelector: string;
  magnetRegExp: RegExp;
  epsAndSeasonRegExps: RegExp[];
  trackerId: (url: string) => string | null;
};

export type TrackerConfWithAuth = TrackerConfBase & {
  isAuthRequired: true;
  dbCredentials: {
    username: keyof DbUserSettings;
    password: keyof DbUserSettings;
  };
  authPath: string;
};

export type TrackerConfWithoutAuth = TrackerConfBase & {
  isAuthRequired: false;
  dbCredentials?: undefined;
  authPath?: undefined;
};

export type TrackerConf = TrackerConfWithAuth | TrackerConfWithoutAuth;

export type ErrorResponse = {
  status: 400 | 401 | 404 | 500;
  body: { success: false; message: string };
};
