import type {
  FileEntry,
  FileRoot,
  Location,
  MarqueeRect,
  MarqueeState,
  SortMode,
} from './types';

export function isEditableElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function isMarqueeBlockedTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        '[data-file-item], button, a, input, textarea, [role="menu"], [data-radix-menu-content], [data-orientation="vertical"], [data-orientation="horizontal"]',
      ),
    )
  );
}

export function getMarqueeRect(marquee: MarqueeState): MarqueeRect {
  return {
    left: Math.min(marquee.startX, marquee.currentX),
    right: Math.max(marquee.startX, marquee.currentX),
    top: Math.min(marquee.startY, marquee.currentY),
    bottom: Math.max(marquee.startY, marquee.currentY),
  };
}

export function getMarqueeDistance(marquee: MarqueeState): number {
  return Math.hypot(
    marquee.currentX - marquee.startX,
    marquee.currentY - marquee.startY,
  );
}

export function getIntersectingPaths(
  marquee: MarqueeRect,
  entries: FileEntry[],
  entryRefs: ReadonlyMap<string, HTMLElement>,
): string[] {
  return entries
    .filter((entry) => {
      const element = entryRefs.get(entry.path);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.left <= marquee.right &&
        rect.right >= marquee.left &&
        rect.top <= marquee.bottom &&
        rect.bottom >= marquee.top
      );
    })
    .map((entry) => entry.path);
}

export function mergePaths(first: string[], second: string[]): string[] {
  return [...new Set([...first, ...second])];
}

export function openEntry(
  entry: FileEntry,
  root: FileRoot,
  navigate: (location: Location) => void,
): void {
  if (entry.type === 'directory') navigate({ root, path: entry.path });
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function rootLabel(root: FileRoot): string {
  return root === 'media' ? 'Media' : 'Downloads';
}

export function compareEntries(
  left: FileEntry,
  right: FileEntry,
  mode: SortMode,
  directorySizes?: ReadonlyMap<string, { size: number | null }>,
): number {
  if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
  if (mode === 'date') {
    const difference =
      getTimestamp(right.modifiedAt) - getTimestamp(left.modifiedAt);
    return difference || compareEntryNames(left, right);
  }
  if (mode === 'size') {
    const difference =
      getSortableSize(getEntrySize(right, directorySizes)) -
      getSortableSize(getEntrySize(left, directorySizes));
    return difference || compareEntryNames(left, right);
  }
  return compareEntryNames(left, right);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export type SelectedSizeSummary = {
  selectedCount: number;
  knownCount: number;
  knownBytes: number;
  pendingCount: number;
  unavailableCount: number;
};

export function getSelectedSizeSummary(
  entries: readonly FileEntry[],
  directorySizes: ReadonlyMap<string, { size: number | null; status?: string }>,
): SelectedSizeSummary {
  const summary: SelectedSizeSummary = {
    selectedCount: 0,
    knownCount: 0,
    knownBytes: 0,
    pendingCount: 0,
    unavailableCount: 0,
  };
  const seenPaths = new Set<string>();

  for (const entry of entries) {
    if (seenPaths.has(entry.path)) continue;
    seenPaths.add(entry.path);
    summary.selectedCount += 1;

    if (entry.type === 'file') {
      addKnownOrUnavailableSize(summary, entry.size);
      continue;
    }

    const directorySize = directorySizes.get(entry.path);
    if (!directorySize) {
      if (entry.size === null) summary.pendingCount += 1;
      else addKnownSize(summary, entry.size);
      continue;
    }
    if (
      (directorySize.status === undefined ||
        directorySize.status === 'ready') &&
      directorySize.size !== null
    ) {
      addKnownSize(summary, directorySize.size);
    } else {
      summary.unavailableCount += 1;
    }
  }

  return summary;
}

export function formatSelectedSizeSummary(
  summary: SelectedSizeSummary,
): string {
  const countLabel = `${summary.selectedCount} item${
    summary.selectedCount === 1 ? '' : 's'
  } selected`;
  const labels = [countLabel];
  const isPartial = summary.pendingCount > 0 || summary.unavailableCount > 0;

  if (summary.knownCount > 0) {
    labels.push(
      `${isPartial ? 'At least ' : ''}${formatBytes(summary.knownBytes)}`,
    );
  }
  if (summary.pendingCount > 0) labels.push('Calculating…');
  if (summary.unavailableCount > 0) {
    labels.push(
      `Size unavailable for ${summary.unavailableCount} item${
        summary.unavailableCount === 1 ? '' : 's'
      }`,
    );
  }

  return labels.join(' · ');
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function canRenameEntry(entry: FileEntry): boolean {
  return entry.permissions.rename && !entry.isTorrentLinked;
}

export function isValidBatchRenameName(name: string): boolean {
  return (
    name.length > 0 &&
    name.trim().length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    !/^[A-Za-z]:/.test(name)
  );
}

export type BatchRenameMode = 'replace' | 'replace-pattern' | 'add' | 'format';
export type BatchRenamePosition = 'before' | 'after';
export type BatchRenameFormat =
  | 'name-index'
  | 'index'
  | 'name-counter'
  | 'counter';
export const BATCH_RENAME_MAX_ITEMS = 100;
export const BATCH_RENAME_MAX_WILDCARDS = 9;
export const BATCH_RENAME_MAX_TEXT_LENGTH = 200;

export type BatchRenameOptions =
  | {
      mode: 'replace';
      find: string;
      replacement: string;
    }
  | {
      mode: 'replace-pattern';
      find: string;
      replacement: string;
    }
  | {
      mode: 'add';
      text: string;
      position: BatchRenamePosition;
    }
  | {
      mode: 'format';
      customName: string;
      format: BatchRenameFormat;
      position: BatchRenamePosition;
      startNumber: number;
    };

export type BatchRenameForm = {
  mode: BatchRenameMode;
  replaceFind: string;
  replaceReplacement: string;
  addText: string;
  addPosition: BatchRenamePosition;
  formatName: string;
  format: BatchRenameFormat;
  formatPosition: BatchRenamePosition;
  startNumber: number;
};

export type BatchRenamePreview = {
  path: string;
  originalName: string;
  newName: string;
};

type BatchRenamePatternPart =
  | { type: 'literal'; value: string }
  | { type: 'wildcard' };

type BatchRenameWildcardMatch = {
  start: number;
  end: number;
  captures: string[];
};

export function getBatchRenameOptions(
  form: BatchRenameForm,
): BatchRenameOptions {
  if (form.mode === 'replace' || form.mode === 'replace-pattern') {
    return {
      mode: form.mode,
      find: form.replaceFind,
      replacement: form.replaceReplacement,
    };
  }
  if (form.mode === 'add') {
    return {
      mode: 'add',
      text: form.addText,
      position: form.addPosition,
    };
  }
  return {
    mode: 'format',
    customName: form.formatName,
    format: form.format,
    position: form.formatPosition,
    startNumber: form.startNumber,
  };
}

export function getBatchRenamePreview(
  entries: readonly FileEntry[],
  options: BatchRenameOptions,
): BatchRenamePreview[] {
  if (getBatchRenameOptionsValidationMessage(options)) {
    return entries.map((entry) => ({
      path: entry.path,
      originalName: entry.name,
      newName: entry.name,
    }));
  }
  return entries.map((entry, index) => ({
    path: entry.path,
    originalName: entry.name,
    newName: buildBatchRenameName(entry, options, index),
  }));
}

export function getBatchRenameValidationMessage(
  preview: readonly BatchRenamePreview[],
  options?: BatchRenameOptions,
): string | null {
  if (preview.length < 2) return 'Select at least two items';
  if (preview.length > BATCH_RENAME_MAX_ITEMS) {
    return `Cannot rename more than ${BATCH_RENAME_MAX_ITEMS} items`;
  }
  if (options) {
    const optionsMessage = getBatchRenameOptionsValidationMessage(options);
    if (optionsMessage) return optionsMessage;
  }
  if (preview.some((item) => item.newName.trim().length === 0)) {
    return 'Names cannot be empty';
  }
  if (preview.some((item) => !isValidBatchRenameName(item.newName))) {
    return 'Names must be a single non-empty basename';
  }
  const names = new Set<string>();
  for (const item of preview) {
    const normalizedName = item.newName.toLocaleLowerCase();
    if (names.has(normalizedName)) return 'Each item must have a unique name';
    names.add(normalizedName);
  }
  if (preview.every((item) => item.newName === item.originalName)) {
    return 'Choose a different name pattern';
  }
  return null;
}

function getBatchRenameOptionsValidationMessage(
  options: BatchRenameOptions,
): string | null {
  if (options.mode === 'replace') {
    if (options.find.trim().length === 0) return 'Enter text to find';
    if (options.find.length > BATCH_RENAME_MAX_TEXT_LENGTH) {
      return `Find text must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`;
    }
    if (options.replacement.length > BATCH_RENAME_MAX_TEXT_LENGTH) {
      return `Replacement text must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`;
    }
    return null;
  }
  if (options.mode === 'replace-pattern') {
    if (options.find.trim().length === 0) return 'Enter a pattern to find';
    if (options.find.length > BATCH_RENAME_MAX_TEXT_LENGTH) {
      return `Pattern must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`;
    }
    const wildcardMessage = getBatchRenameWildcardValidationMessage(
      options.find,
    );
    if (wildcardMessage) return wildcardMessage;
    if (options.replacement.length > BATCH_RENAME_MAX_TEXT_LENGTH) {
      return `Replacement text must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`;
    }
    return getBatchRenameReplacementValidationMessage(
      options.find,
      options.replacement,
    );
  }
  if (options.mode === 'add') {
    if (options.text.trim().length === 0) return 'Enter text to add';
    if (options.text.length > BATCH_RENAME_MAX_TEXT_LENGTH) {
      return `Text to add must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`;
    }
    return null;
  }
  if (options.customName.length > BATCH_RENAME_MAX_TEXT_LENGTH) {
    return `Custom format must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`;
  }
  return null;
}

function buildBatchRenameName(
  entry: FileEntry,
  options: BatchRenameOptions,
  index: number,
): string {
  if (options.mode === 'replace-pattern') {
    return replaceBatchRenamePatternText(
      entry.name,
      options.find,
      options.replacement,
    );
  }

  const { stem, extension } = splitFileName(entry);
  let renamedStem: string;

  if (options.mode === 'replace') {
    renamedStem = replaceBatchRenameText(
      stem,
      options.find,
      options.replacement,
    );
  } else if (options.mode === 'add') {
    renamedStem =
      options.position === 'before'
        ? `${options.text}${stem}`
        : `${stem}${options.text}`;
  } else {
    const value = getBatchRenameFormatValue(options, index);
    if (options.format === 'index' || options.format === 'counter') {
      renamedStem = value;
    } else {
      const customName = options.customName.trim() || stem;
      renamedStem =
        options.position === 'before'
          ? `${value} ${customName}`
          : `${customName} ${value}`;
    }
  }

  return `${renamedStem}${extension}`;
}

function splitFileName(entry: FileEntry): { stem: string; extension: string } {
  if (entry.type === 'directory') return { stem: entry.name, extension: '' };
  const dotIndex = entry.name.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === entry.name.length - 1) {
    return { stem: entry.name, extension: '' };
  }
  return {
    stem: entry.name.slice(0, dotIndex),
    extension: entry.name.slice(dotIndex),
  };
}

function getBatchRenameFormatValue(
  options: Extract<BatchRenameOptions, { mode: 'format' }>,
  index: number,
): string {
  const number = options.startNumber + index;
  if (options.format === 'name-index' || options.format === 'index') {
    return String(number);
  }
  return String(number).padStart(5, '0');
}

function replaceBatchRenameText(
  value: string,
  find: string,
  replacement: string,
): string {
  if (find.length === 0) return value;
  if (find.length > BATCH_RENAME_MAX_TEXT_LENGTH) return value;
  const escapedFind = escapeBatchRenameRegexLiteral(find);
  return value.replace(new RegExp(escapedFind, 'gi'), () => replacement);
}

function replaceBatchRenamePatternText(
  value: string,
  find: string,
  replacement: string,
): string {
  if (
    find.length === 0 ||
    find.length > BATCH_RENAME_MAX_TEXT_LENGTH ||
    getBatchRenameWildcardValidationMessage(find)
  ) {
    return value;
  }
  const pattern = parseBatchRenamePattern(find);
  const digitRunEnds = getBatchRenameDigitRunEnds(value);
  const literalMatches = getBatchRenameLiteralMatches(value, pattern);
  let result = '';
  let outputIndex = 0;
  let searchIndex = 0;
  while (searchIndex < value.length) {
    const match = findBatchRenameWildcardMatch(
      value,
      pattern,
      literalMatches,
      digitRunEnds,
      searchIndex,
    );
    if (!match) break;
    result += value.slice(outputIndex, match.start);
    result += applyBatchRenameReplacement(replacement, match.captures);
    outputIndex = match.end;
    searchIndex = match.end;
  }
  return result + value.slice(outputIndex);
}

function getBatchRenameWildcardValidationMessage(find: string): string | null {
  if (find.includes('%%%%')) return 'Separate adjacent %% tokens';
  if (countBatchRenameWildcards(find) > BATCH_RENAME_MAX_WILDCARDS) {
    return `Use at most ${BATCH_RENAME_MAX_WILDCARDS} %% tokens`;
  }
  return null;
}

function getBatchRenameReplacementValidationMessage(
  find: string,
  replacement: string,
): string | null {
  const captureCount = countBatchRenameWildcards(find);
  const references = [...replacement.matchAll(/\$(\d+)/g)];
  if (references.length === 0) return null;
  if (captureCount === 0) {
    return 'Use $1…$9 only with a %% capture';
  }

  for (const match of references) {
    const rawCaptureNumber = match[1] ?? '';
    const captureNumber = Number(rawCaptureNumber);
    if (
      rawCaptureNumber.length !== 1 ||
      !Number.isSafeInteger(captureNumber) ||
      captureNumber < 1 ||
      captureNumber > captureCount
    ) {
      return captureCount === 1
        ? 'Use $1 for the captured digits'
        : `Use $1 to $${captureCount} for captured digits`;
    }
  }
  return null;
}

function countBatchRenameWildcards(find: string): number {
  return find.split('%%').length - 1;
}

function parseBatchRenamePattern(find: string): BatchRenamePatternPart[] {
  const parts: BatchRenamePatternPart[] = [];
  let cursor = 0;
  while (cursor < find.length) {
    const tokenIndex = find.indexOf('%%', cursor);
    if (tokenIndex === -1) {
      parts.push({ type: 'literal', value: find.slice(cursor) });
      break;
    }
    if (tokenIndex > cursor) {
      parts.push({ type: 'literal', value: find.slice(cursor, tokenIndex) });
    }
    parts.push({ type: 'wildcard' });
    cursor = tokenIndex + 2;
  }
  return parts;
}

function isBatchRenameDigit(value: string, index: number): boolean {
  const code = value.charCodeAt(index);
  return code >= 48 && code <= 57;
}

function getBatchRenameDigitRunEnds(value: string): number[] {
  const ends = Array.from({ length: value.length }, () => value.length);
  let cursor = 0;
  while (cursor < value.length) {
    if (!isBatchRenameDigit(value, cursor)) {
      cursor += 1;
      continue;
    }
    const runStart = cursor;
    while (cursor < value.length && isBatchRenameDigit(value, cursor)) {
      cursor += 1;
    }
    for (let index = runStart; index < cursor; index += 1) {
      ends[index] = cursor;
    }
  }
  return ends;
}

function matchesBatchRenameLiteralAt(
  value: string,
  literal: string,
  position: number,
): boolean {
  if (position < 0 || position + literal.length > value.length) return false;

  let isAscii = true;
  for (let index = 0; index < literal.length; index += 1) {
    if (
      value.charCodeAt(position + index) > 0x7f ||
      literal.charCodeAt(index) > 0x7f
    ) {
      isAscii = false;
      break;
    }
  }
  if (isAscii) {
    for (let index = 0; index < literal.length; index += 1) {
      if (
        toLowerAsciiCode(value.charCodeAt(position + index)) !==
        toLowerAsciiCode(literal.charCodeAt(index))
      ) {
        return false;
      }
    }
    return true;
  }

  return (
    value.slice(position, position + literal.length).toLocaleLowerCase() ===
    literal.toLocaleLowerCase()
  );
}

function toLowerAsciiCode(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

function getBatchRenameLiteralMatches(
  value: string,
  pattern: readonly BatchRenamePatternPart[],
): ReadonlyMap<string, number[]> {
  const literals = new Set(
    pattern
      .filter(
        (part): part is Extract<BatchRenamePatternPart, { type: 'literal' }> =>
          part.type === 'literal',
      )
      .map((part) => part.value),
  );
  const matches = new Map<string, number[]>();
  for (const literal of literals) {
    const positions = Array.from({ length: value.length + 1 }, () => -1);
    let nextMatch = -1;
    for (let position = value.length; position >= 0; position -= 1) {
      if (matchesBatchRenameLiteralAt(value, literal, position)) {
        nextMatch = position;
      }
      positions[position] = nextMatch;
    }
    matches.set(literal, positions);
  }
  return matches;
}

function findBatchRenameWildcardMatch(
  value: string,
  pattern: readonly BatchRenamePatternPart[],
  literalMatches: ReadonlyMap<string, number[]>,
  digitRunEnds: readonly number[],
  searchIndex: number,
): BatchRenameWildcardMatch | null {
  for (let start = searchIndex; start < value.length; start += 1) {
    const match = matchBatchRenamePatternAt(
      value,
      pattern,
      literalMatches,
      digitRunEnds,
      start,
    );
    if (match) return match;
  }
  return null;
}

function matchBatchRenamePatternAt(
  value: string,
  pattern: readonly BatchRenamePatternPart[],
  literalMatches: ReadonlyMap<string, number[]>,
  digitRunEnds: readonly number[],
  start: number,
): BatchRenameWildcardMatch | null {
  let position = start;
  const captures: string[] = [];

  for (let index = 0; index < pattern.length; index += 1) {
    const part = pattern[index];
    if (part.type === 'literal') {
      if (!matchesBatchRenameLiteralAt(value, part.value, position)) {
        return null;
      }
      position += part.value.length;
      continue;
    }

    if (!isBatchRenameDigit(value, position)) return null;
    const runEnd = digitRunEnds[position] ?? position;
    const nextPart = pattern[index + 1];
    if (nextPart?.type === 'wildcard') return null;
    if (!nextPart) {
      captures.push(value.slice(position, runEnd));
      position = runEnd;
      continue;
    }

    const positions = literalMatches.get(nextPart.value);
    const boundary = positions?.[position + 1] ?? -1;
    if (boundary < 0 || boundary > runEnd) return null;
    captures.push(value.slice(position, boundary));
    position = boundary;
  }

  return { start, end: position, captures };
}

function applyBatchRenameReplacement(
  replacement: string,
  captures: readonly string[],
): string {
  let result = '';
  let lastIndex = 0;
  for (const match of replacement.matchAll(/\$(\d+)/g)) {
    const matchIndex = match.index;
    if (matchIndex === undefined) continue;
    result += replacement.slice(lastIndex, matchIndex);
    const captureNumber = Number(match[1]);
    result += captures[captureNumber - 1] ?? match[0];
    lastIndex = matchIndex + match[0].length;
  }
  return result + replacement.slice(lastIndex);
}

function escapeBatchRenameRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTimestamp(value: string | null): number {
  return value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY;
}

function getSortableSize(value: number | null): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

function getEntrySize(
  entry: FileEntry,
  directorySizes?: ReadonlyMap<string, { size: number | null }>,
): number | null {
  return entry.type === 'directory'
    ? (directorySizes?.get(entry.path)?.size ?? entry.size)
    : entry.size;
}

function addKnownOrUnavailableSize(
  summary: SelectedSizeSummary,
  size: number | null,
): void {
  if (size === null) summary.unavailableCount += 1;
  else addKnownSize(summary, size);
}

function addKnownSize(summary: SelectedSizeSummary, size: number): void {
  summary.knownCount += 1;
  summary.knownBytes += size;
}

function compareEntryNames(left: FileEntry, right: FileEntry): number {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
