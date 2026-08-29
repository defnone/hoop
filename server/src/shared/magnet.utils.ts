const SHA1_HEX_PATTERN = /^[0-9a-f]{40}$/i;
const SHA1_BASE32_PATTERN = /^[a-z2-7]{32}$/i;
const SHA256_MULTIHASH_PATTERN = /^1220([0-9a-f]{64})$/i;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type TorrentIdentity = `btih:${string}` | `btmh:${string}`;

export function areMagnetsEquivalent(first: string, second: string): boolean {
  if (first === second) return true;

  const firstIdentity = tryGetCanonicalIdentity(first);
  const secondIdentity = tryGetCanonicalIdentity(second);

  return (
    firstIdentity !== null &&
    secondIdentity !== null &&
    firstIdentity === secondIdentity
  );
}

export function extractTorrentIdentities(value: string): string[] {
  const trimmedValue = value.trim();
  if (SHA1_HEX_PATTERN.test(trimmedValue)) {
    return [`btih:${trimmedValue.toLowerCase()}`];
  }

  const magnetUrl = new URL(trimmedValue);
  if (magnetUrl.protocol.toLowerCase() !== 'magnet:') {
    throw new Error('Magnet must use the magnet protocol');
  }

  const exactTopics = magnetUrl.searchParams.getAll('xt');
  if (exactTopics.length === 0) {
    throw new Error('Magnet does not contain a supported torrent hash');
  }

  const identities: TorrentIdentity[] = [];
  for (const topic of exactTopics) {
    const identity = parseExactTopic(topic);
    if (identity) identities.push(identity);
  }

  if (identities.length === 0) {
    throw new Error('Magnet does not contain a supported torrent hash');
  }

  return [...new Set(identities)].sort();
}

export function extractTorrentHash(value: string): string {
  const identities = extractTorrentIdentities(value);
  const btih = identities.find((identity) => identity.startsWith('btih:'));
  if (btih) return btih.slice('btih:'.length);

  const btmh = identities.find((identity) => identity.startsWith('btmh:'));
  if (btmh) return btmh.slice('btmh:'.length);

  throw new Error('Magnet does not contain a supported torrent hash');
}

export function normalizeTorrentMagnet(value: string): string {
  const trimmedValue = value.trim();
  if (SHA1_HEX_PATTERN.test(trimmedValue)) {
    return `magnet:?xt=urn:btih:${trimmedValue}`;
  }
  return trimmedValue;
}

function parseExactTopic(topic: string): TorrentIdentity | null {
  const topicPrefix = topic.slice(0, 9).toLowerCase();
  if (topicPrefix === 'urn:btih:') {
    return `btih:${parseBtih(topic.slice(9))}`;
  }

  if (topicPrefix === 'urn:btmh:') {
    return `btmh:${parseBtmh(topic.slice(9))}`;
  }

  return null;
}

function parseBtih(value: string): string {
  if (SHA1_HEX_PATTERN.test(value)) return value.toLowerCase();
  if (SHA1_BASE32_PATTERN.test(value)) return decodeBase32(value);
  throw new Error('Magnet contains an unsupported btih hash');
}

function parseBtmh(value: string): string {
  const digest = value.match(SHA256_MULTIHASH_PATTERN)?.[1];
  if (!digest) throw new Error('Magnet contains an unsupported btmh hash');
  return digest.toLowerCase();
}

function decodeBase32(value: string): string {
  let bits = 0;
  let buffer = 0;
  let result = '';

  for (const character of value.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      result += ((buffer >>> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }

  return result;
}

function tryGetCanonicalIdentity(value: string): string | null {
  try {
    return extractTorrentIdentities(normalizeTorrentMagnet(value)).join('|');
  } catch {
    return null;
  }
}
