const SHA1_HEX_PATTERN = /^[0-9a-f]{40}$/i;
const SHA1_BASE32_PATTERN = /^[a-z2-7]{32}$/i;
const SHA256_MULTIHASH_PATTERN = /^1220([0-9a-f]{64})$/i;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function extractTorrentHash(magnet: string): string {
  const exactTopics = new URL(magnet).searchParams.getAll('xt');
  const btih = exactTopics.find((topic) =>
    topic.toLowerCase().startsWith('urn:btih:'),
  );
  if (btih) return parseBtih(btih.slice('urn:btih:'.length));

  const btmh = exactTopics.find((topic) =>
    topic.toLowerCase().startsWith('urn:btmh:'),
  );
  if (btmh) return parseBtmh(btmh.slice('urn:btmh:'.length));

  throw new Error('Magnet does not contain a supported torrent hash');
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
