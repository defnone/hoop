import type {
  eventJournalStates,
  eventJournalTypes,
} from '@server/db/app/app-schema';

export type EventJournalType = (typeof eventJournalTypes)[number];
export type EventJournalState = (typeof eventJournalStates)[number];

export type EventJournalDto = {
  id: number;
  type: EventJournalType;
  state: EventJournalState;
  torrentItemId: number | null;
  torrentTitle: string;
  oldValue: string | null;
  newValue: string | null;
  isNotification: boolean;
  readAt: number | null;
  createdAt: number;
};

export type EventJournalPageDto = {
  items: EventJournalDto[];
  total: number;
  page: number;
  hasNext: boolean;
};
