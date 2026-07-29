export function getEpisodeNumbersFromFilePath(filePath: string): number[] {
  const pathParts = filePath.split(/[\\/]/);
  const fileName = getFileNameFromPath(filePath);
  const primaryEpisodes = getPrimaryEpisodeNumbers(fileName);
  if (primaryEpisodes.length > 0) return primaryEpisodes;

  for (let index = pathParts.length - 2; index >= 0; index -= 1) {
    const pathPart = pathParts[index];
    if (!pathPart) continue;
    const parentEpisodes = getExplicitEpisodeNumbers(pathPart);
    if (parentEpisodes.length > 0) return parentEpisodes;
  }

  return getFallbackEpisodeNumbers(fileName);
}

export function getFileNameFromPath(filePath: string): string {
  const pathParts = filePath.split(/[\\/]/);
  return pathParts[pathParts.length - 1] ?? filePath;
}

// ----- Episode pattern helpers -----

function getPrimaryEpisodeNumbers(fileName: string): number[] {
  const explicitEpisodes = getExplicitEpisodeNumbers(fileName);
  if (explicitEpisodes.length > 0) return explicitEpisodes;

  const leadingRange = fileName.match(
    /^\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})(?=\D|$)/,
  );
  if (leadingRange) {
    return toUniqueNumbers([leadingRange[1], leadingRange[2]]);
  }

  const leadingEpisode = fileName.match(
    /^\s*(\d{1,3})(?=\s*[.\-_–—]\s*\D)/,
  )?.[1];
  return leadingEpisode ? [Number(leadingEpisode)] : [];
}

function getFallbackEpisodeNumbers(fileName: string): number[] {
  const seasonEpisodePair = fileName.match(
    /(?:^|[^0-9])(\d{1,2})[.\-_–—x ]+(\d{1,3})(?!\d)/i,
  );
  if (seasonEpisodePair?.[2]) return [Number(seasonEpisodePair[2])];

  const standaloneEpisode = fileName.match(
    /(?<![A-Za-z0-9])(\d{2,3})(?![A-Za-z0-9])/,
  )?.[1];
  return standaloneEpisode ? [Number(standaloneEpisode)] : [];
}

function getExplicitEpisodeNumbers(value: string): number[] {
  const seasonEpisode = value.match(
    /[Ss]\d{1,2}[.\-_–—x ]*[Ee][Pp]?(\d{1,3})(?:(?:[.\-_–— ]*[Ee][Pp]?(\d{1,3}))|(?:[.\-_–— ]+(\d{1,2})(?!\d)))?/i,
  );
  if (seasonEpisode) {
    return toUniqueNumbers([
      seasonEpisode[1],
      seasonEpisode[2],
      seasonEpisode[3],
    ]);
  }

  const xPattern = value.match(
    /(?:^|[^A-Za-z0-9])\d{1,2}x(\d{1,3})(?:[.\-_–— ]*(?:x|[Ee][Pp]?)(\d{1,3}))?/i,
  );
  if (xPattern) return toUniqueNumbers([xPattern[1], xPattern[2]]);

  const episodeToken = value.match(
    /(?:^|[^A-Za-z0-9])(?:Episode|Ep|E)[.\-_–— ]*(\d{1,3})(?!\d)/i,
  )?.[1];
  return episodeToken ? [Number(episodeToken)] : [];
}

function toUniqueNumbers(values: Array<string | undefined>): number[] {
  const result: number[] = [];
  for (const value of values) {
    if (!value) continue;
    const number = Number(value);
    if (!result.includes(number)) result.push(number);
  }
  return result;
}
