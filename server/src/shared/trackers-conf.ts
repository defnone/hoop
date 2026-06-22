import type { TrackerConf } from "./types";

export const trackersConf: Record<string, TrackerConf> = {
  kinozal: {
    urls: ["kinozal.tv", "kinozal.me"],
    titleSelector: "h1",
    showTitle: (title: string) => title.split("/")[1],
    isDifferentMagnetUrl: true,
    magnetUrl: (protocol: string, host: string, id: string) =>
      new URL(`${protocol}//${host}/get_srv_details.php?action=2&id=${id}`),
    magnetSelector: "ul > li:first-child",
    magnetRegExp: /Инфо хеш: (\w+)/,
    epsAndSeasonRegExps: [
      /\((\d+)\s*сезон:\s*(\d+)-(\d+)\s*(?:серии|эпизоды)\s*из\s*(\d+)\)/i,
      /\((\d+)\s*сезон:\s*(\d+)\s*(?:сери(?:я|и)|эпизод(?:ы)?)\s*из\s*(\d+)\)/i,
      /\(сезон\s*:?\s*(\d+)\s*\/?\s*(?:серии|эпизоды)\s*:?\s*(\d+)-(\d+)\s*из\s*(\d+)\)/i,
      /\(сезон\s*:?\s*(\d+)\s*\/?\s*(?:сери(?:я|и)|эпизод(?:ы)?)\s*:?\s*(\d+)\s*из\s*(\d+)\)/i,
    ],
    trackerId: (url: string) => new URL(url).searchParams.get("id"),
    isAuthRequired: true,
    dbCredentials: { username: "kinozalUsername", password: "kinozalPassword" },
    authPath: "/takelogin.php",
  },
  rutracker: {
    urls: ["rutracker.org", "rutracker.net", "rutracker.me"],
    titleSelector: ".maintitle",
    showTitle: (title: string) => title.split("/")[0],
    isDifferentMagnetUrl: false,
    magnetUrl: null,
    magnetSelector: ".attach_link a",
    magnetRegExp: /(\w+)/,
    epsAndSeasonRegExps: [
      /Сезон:?\s*(\d+)\s*\/\s*(?:Серии|Эпизоды):?\s*(\d+)-(\d+)\s*из\s*(\d+)/i,
      /Сезон:?\s*(\d+)\s*\/\s*(?:Серии|Эпизоды):?\s*(\d+)\s*из\s*(\d+)/i,
      /Сезон\S?\s*(\d+)\s*\/?\s*(?:Серии|Эпизоды)\S?\s*(\d+)-(\d+)\s*\S?(\d+)\S?/i,
    ],
    trackerId: (url: string) => new URL(url).searchParams.get("t"),
    isAuthRequired: false,
  },
  nnmClub: {
    urls: ["nnmclub.to"],
    titleSelector: ".maintitle",
    showTitle: (title: string) => title.split("/")[0],
    isDifferentMagnetUrl: false,
    magnetUrl: null,
    magnetSelector: '.gensmall a[href^="magnet:"]',
    magnetRegExp: /(\w+)/,
    epsAndSeasonRegExps: [
      /\(сезон\s*:?\s*(\d+)[,\s/]*(?:серии|эпизоды)\s*:?\s*(\d+)-(\d+)\s*из\s*(\d+)\)/i,
      /\(сезон\s*:?\s*(\d+)[,\s/]*(?:серия|серии|эпизод|эпизоды)\s*:?\s*(\d+)\s*из\s*(\d+)\)/i,
      /[cCсС]езон\W*\s*(\d+)\W*\s*(?:[cCсС]ери[яи]|[эЭ]пизод(?:ы)?)\W*\s+(\d+)\s*\W*(\d+)?\W*(\d+)/i,
    ],
    trackerId: (url: string) => new URL(url).searchParams.get("t"),
    isAuthRequired: false,
  },
} as const;
