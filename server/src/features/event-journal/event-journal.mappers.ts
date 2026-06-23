import type { DbEventJournal } from '@server/db/app/app-schema';
import type { EventJournalDto } from './event-journal.types';

export function toEventJournalDto(row: DbEventJournal): EventJournalDto {
  return {
    id: row.id,
    type: row.type,
    state: row.state,
    torrentItemId: row.torrentItemId,
    torrentTitle: row.torrentTitle,
    oldValue: row.oldValue,
    newValue: row.newValue,
    isNotification: row.isNotification,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function toEventJournalDtos(rows: DbEventJournal[]): EventJournalDto[] {
  return rows.map(toEventJournalDto);
}
