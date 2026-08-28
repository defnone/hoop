import type { FileOwnership } from './types';

export type EntryLockProps = {
  permissionLimited: boolean;
  isTorrentLinked: boolean;
  ownership: FileOwnership | null;
};

export function getEntryAccessibleLabel(
  entryName: string,
  props: EntryLockProps,
): string {
  const description = getEntryLockDescription(props);
  return description ? `${entryName}. ${description}` : entryName;
}

export function getEntryLockDescription(props: EntryLockProps): string {
  return getEntryLockTooltipLines(
    props.permissionLimited,
    props.isTorrentLinked,
    props.ownership,
  ).join('. ');
}

export function getEntryLockTooltipLines(
  permissionLimited: boolean,
  isTorrentLinked: boolean,
  ownership: FileOwnership | null,
): string[] {
  const lines: string[] = [];
  if (permissionLimited) {
    lines.push('Permission denied');
    if (ownership) {
      lines.push(formatOwnerLine('Actual owner', ownership.actual));
      lines.push(
        ownership.expected
          ? formatOwnerLine('Expected owner', ownership.expected)
          : 'Expected owner: unavailable',
      );
    } else {
      lines.push('Owner information unavailable');
    }
  }
  if (isTorrentLinked) lines.push('Linked to torrent');
  return lines;
}

function formatOwnerLine(
  label: 'Actual owner' | 'Expected owner',
  owner: FileOwnership['actual'],
): string {
  const names = [owner.user, owner.group]
    .filter((name): name is string => Boolean(name?.trim()))
    .join(':');
  const identity = names
    ? `${names} (UID:GID ${owner.uid}:${owner.gid})`
    : `UID:GID ${owner.uid}:${owner.gid}`;
  return `${label}: ${identity}`;
}
