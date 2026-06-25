import { Button } from '@/components/ui/button';
import SettingsMenu from '@/components/settings/SettingsMenu';
import { rpc } from '@/lib/rpc';
import type {
  EventJournalDto,
  EventJournalPageDto,
  EventJournalType,
} from '@server/features/event-journal/event-journal.types';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

const EVENTS_PAGE_LIMIT = 30;
const EVENT_JOURNAL_QUERY_KEY = ['event-journal'] as const;
const USE_DEV_EVENT_JOURNAL = import.meta.env.DEV;

export default function Journal() {
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    status,
  } = useInfiniteQuery({
    queryKey: EVENT_JOURNAL_QUERY_KEY,
    queryFn: async ({ pageParam }): Promise<EventJournalPageDto> => {
      if (USE_DEV_EVENT_JOURNAL) {
        return getMockEventJournalPage(pageParam);
      }

      const response = await rpc.api['event-journal'].$get({
        query: {
          page: String(pageParam),
          limit: String(EVENTS_PAGE_LIMIT),
        },
      });
      const body = await response.json();
      if (!body.success || !body.data) {
        throw new Error(body.message || 'Failed to load event journal');
      }
      return body.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasNext ? lastPage.page + 1 : undefined,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number): Promise<EventJournalDto> => {
      if (USE_DEV_EVENT_JOURNAL) {
        return markMockEventAsRead(id);
      }

      const response = await rpc.api['event-journal'][':id'].read.$put({
        param: { id: String(id) },
      });
      const body = await response.json();
      if (!body.success || !body.data) {
        throw new Error(body.message || 'Failed to mark event as read');
      }
      return body.data;
    },
    onSuccess: (updatedEvent) => {
      queryClient.setQueryData<InfiniteData<EventJournalPageDto>>(
        EVENT_JOURNAL_QUERY_KEY,
        (currentData) => updateReadEventInPages(currentData, updatedEvent)
      );
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async (): Promise<EventJournalDto[]> => {
      if (USE_DEV_EVENT_JOURNAL) {
        return markAllMockEventsAsRead();
      }

      const response = await rpc.api['event-journal']['read-all'].$put();
      const body = await response.json();
      if (!body.success || !body.data) {
        throw new Error(body.message || 'Failed to mark all events as read');
      }
      return body.data;
    },
    onSuccess: () => {
      queryClient.setQueryData<InfiniteData<EventJournalPageDto>>(
        EVENT_JOURNAL_QUERY_KEY,
        markAllReadEventsInPages
      );
    },
  });

  const events = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  );
  const hasUnreadEvents = events.some((event) => event.readAt === null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry?.isIntersecting && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (status === 'error') {
    return (
      <div className='flex flex-col w-full pb-5 gap-2'>
        <SettingsMenu />

        <p className='text-sm text-destructive'>{error.message}</p>
      </div>
    );
  }

  return (
    <div className='flex flex-col w-full pb-5 gap-2'>
      <SettingsMenu />
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          {isLoading && (
            <LoaderCircle className='size-5 animate-spin text-muted-foreground' />
          )}
          <Button
            variant='outline'
            className='ml-auto'
            disabled={!hasUnreadEvents || markAllAsReadMutation.isPending}
            onClick={() => markAllAsReadMutation.mutate()}
          >
            Mark all as read
          </Button>
        </div>
      </div>

      {!isLoading && events.length === 0 && (
        <div className='rounded-md px-4 py-8 text-center text-sm text-muted-foreground'>
          No events yet
        </div>
      )}

      <div className='flex flex-col'>
        {events.map((event) => (
          <JournalEventRow
            key={event.id}
            event={event}
            isMarkingAsRead={
              markAsReadMutation.isPending &&
              markAsReadMutation.variables === event.id
            }
            onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
          />
        ))}
      </div>

      <div
        ref={loadMoreRef}
        className='min-h-8 flex items-center justify-center'
      >
        {isFetchingNextPage && (
          <LoaderCircle className='size-5 animate-spin text-muted-foreground' />
        )}
      </div>
    </div>
  );
}

function JournalEventRow({
  event,
  isMarkingAsRead,
  onMarkAsRead,
}: {
  event: EventJournalDto;
  isMarkingAsRead: boolean;
  onMarkAsRead: (id: number) => void;
}) {
  const isUnread = event.readAt === null;

  const handleMarkAsRead = () => {
    if (!isUnread || isMarkingAsRead || hasSelectedText()) return;
    onMarkAsRead(event.id);
  };

  return (
    <article
      role='button'
      tabIndex={isUnread ? 0 : -1}
      aria-disabled={!isUnread || isMarkingAsRead}
      onClick={handleMarkAsRead}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleMarkAsRead();
      }}
      className='grid w-full grid-cols-[10px_1fr] gap-4 border-b border-zinc-800 py-7 px-2 text-left transition-colors hover:bg-zinc-900/70'
    >
      <span className='flex h-6 items-center justify-center'>
        {isUnread && <span className='h-2.5 w-2.5 rounded-full bg-blue-500' />}
      </span>

      <div className='min-w-0 flex select-text flex-col gap-2'>
        <span
          className={cn(
            'text-base font-bold ',
            event.state === 'error' ? 'text-red-500' : 'text-zinc-100'
          )}
        >
          {formatEventTitle(event.type, event.torrentTitle)}
        </span>
        <JournalEventDetails event={event} />
        <time
          dateTime={new Date(event.createdAt).toISOString()}
          className='text-sm text-zinc-400 mt-2 font-mono'
        >
          {new Date(event.createdAt).toLocaleString()}
        </time>
      </div>
    </article>
  );
}

function hasSelectedText(): boolean {
  return window.getSelection()?.toString().trim().length ? true : false;
}

function formatEventTitle(
  type: EventJournalType,
  torrentTitle: string
): string {
  switch (type) {
    case 'torrentTitleChanged':
      return `Torrent ${torrentTitle} updated because title changed`;
    case 'torrentMagnetChanged':
      return `Torrent ${torrentTitle} updated because magnet changed`;
    case 'torrentSyncFailed':
      return `Torrent ${torrentTitle} sync failed`;
    case 'torrentDownloadStarted':
      return `Torrent ${torrentTitle} download started`;
    case 'torrentDownloadCompleted':
      return `Torrent ${torrentTitle} download completed`;
    case 'torrentDownloadFailed':
      return `Torrent ${torrentTitle} download failed`;
    case 'torrentFileCopyStarted':
      return `Torrent ${torrentTitle} file copy started`;
    case 'torrentFileCopyCompleted':
      return `Torrent ${torrentTitle} file copy completed`;
    case 'torrentFileCopyFailed':
      return `Torrent ${torrentTitle} file copy failed`;
  }
}

function formatEventDetails(event: EventJournalDto): string {
  if (!event.oldValue && !event.newValue) {
    return 'No value details';
  }

  if (!event.oldValue && event.newValue) {
    return event.newValue;
  }

  if (event.oldValue && !event.newValue) {
    return event.oldValue;
  }

  return `${event.oldValue ?? 'Empty value'} -> ${
    event.newValue ?? 'Empty value'
  }`;
}

function JournalEventDetails({ event }: { event: EventJournalDto }) {
  if (event.oldValue && event.newValue) {
    return <DiffDetails oldValue={event.oldValue} newValue={event.newValue} />;
  }

  return (
    <p className='wrap-break-word whitespace-pre-wrap font-mono text-[0.90rem] text-zinc-400'>
      {formatEventDetails(event)}
    </p>
  );
}

function DiffDetails({
  oldValue,
  newValue,
}: {
  oldValue: string;
  newValue: string;
}) {
  const diff = buildDiffParts(oldValue, newValue);

  return (
    <div className='flex min-w-0 flex-col gap-1 text-[0.90rem] font-mono leading-6'>
      <p className='wrap-break-word text-zinc-400'>
        {diff.oldParts.map((part, index) => (
          <DiffPart
            key={`${part.value}-${index}`}
            part={part}
            variant='removed'
          />
        ))}
      </p>
      <p className='wrap-break-word text-zinc-300'>
        {diff.newParts.map((part, index) => (
          <DiffPart
            key={`${part.value}-${index}`}
            part={part}
            variant='added'
          />
        ))}
      </p>
    </div>
  );
}

function DiffPart({
  part,
  variant,
}: {
  part: DiffPartValue;
  variant: 'added' | 'removed';
}) {
  if (!part.changed) {
    return <span>{part.value}</span>;
  }

  return (
    <span
      className={cn(
        'px-1 py-0.5',
        variant === 'added'
          ? 'bg-emerald-500/20 text-emerald-200'
          : 'bg-red-500/20 text-red-200'
      )}
    >
      {part.value}
    </span>
  );
}

type DiffPartValue = {
  value: string;
  changed: boolean;
};

function buildDiffParts(
  oldValue: string,
  newValue: string
): { oldParts: DiffPartValue[]; newParts: DiffPartValue[] } {
  const oldTokens = tokenizeDiffValue(oldValue);
  const newTokens = tokenizeDiffValue(newValue);
  const prefixLength = getCommonPrefixLength(oldTokens, newTokens);
  const suffixLength = getCommonSuffixLength(
    oldTokens,
    newTokens,
    prefixLength
  );

  return {
    oldParts: createDiffParts(oldTokens, prefixLength, suffixLength),
    newParts: createDiffParts(newTokens, prefixLength, suffixLength),
  };
}

function tokenizeDiffValue(value: string): string[] {
  return value.match(/\S+|\s+/g) ?? [];
}

function getCommonPrefixLength(
  oldTokens: string[],
  newTokens: string[]
): number {
  const maxLength = Math.min(oldTokens.length, newTokens.length);
  let index = 0;

  while (index < maxLength && oldTokens[index] === newTokens[index]) {
    index += 1;
  }

  return index;
}

function getCommonSuffixLength(
  oldTokens: string[],
  newTokens: string[],
  prefixLength: number
): number {
  let suffixLength = 0;
  const maxLength = Math.min(
    oldTokens.length - prefixLength,
    newTokens.length - prefixLength
  );

  while (
    suffixLength < maxLength &&
    oldTokens[oldTokens.length - 1 - suffixLength] ===
      newTokens[newTokens.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return suffixLength;
}

function createDiffParts(
  tokens: string[],
  prefixLength: number,
  suffixLength: number
): DiffPartValue[] {
  const changedStart = prefixLength;
  const changedEnd = tokens.length - suffixLength;

  return tokens.map((value, index) => ({
    value,
    changed: index >= changedStart && index < changedEnd,
  }));
}

function updateReadEventInPages(
  currentData: InfiniteData<EventJournalPageDto> | undefined,
  updatedEvent: EventJournalDto
): InfiniteData<EventJournalPageDto> | undefined {
  if (!currentData) return currentData;

  return {
    ...currentData,
    pages: currentData.pages.map((page) => ({
      ...page,
      items: page.items.map((event) =>
        event.id === updatedEvent.id ? updatedEvent : event
      ),
    })),
  };
}

function markAllReadEventsInPages(
  currentData: InfiniteData<EventJournalPageDto> | undefined
): InfiniteData<EventJournalPageDto> | undefined {
  if (!currentData) return currentData;
  const readAt = Date.now();

  return {
    ...currentData,
    pages: currentData.pages.map((page) => ({
      ...page,
      items: page.items.map((event) => ({
        ...event,
        readAt: event.readAt ?? readAt,
      })),
    })),
  };
}

const mockEventJournalItems: EventJournalDto[] = [
  {
    id: 1,
    type: 'torrentTitleChanged',
    state: 'info',
    torrentItemId: 101,
    torrentTitle: 'Resident Alien',
    oldValue: 'Resident Alien S03 1080p WEB-DL',
    newValue: 'Resident Alien S03 1080p WEB-DL Proper',
    isNotification: true,
    readAt: null,
    createdAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: 2,
    type: 'torrentMagnetChanged',
    state: 'info',
    torrentItemId: 102,
    torrentTitle: 'House M.D.',
    oldValue: 'magnet:?xt=urn:btih:OLDHOUSEHASH',
    newValue: 'magnet:?xt=urn:btih:NEWHOUSEHASH',
    isNotification: false,
    readAt: null,
    createdAt: Date.now() - 1000 * 60 * 45,
  },
  {
    id: 3,
    type: 'torrentTitleChanged',
    state: 'info',
    torrentItemId: 103,
    torrentTitle: 'Clarksons Farm',
    oldValue: 'Clarksons Farm S04 E01-E04',
    newValue: 'Clarksons Farm S04 E01-E08',
    isNotification: false,
    readAt: Date.now() - 1000 * 60 * 30,
    createdAt: Date.now() - 1000 * 60 * 90,
  },
  {
    id: 4,
    type: 'torrentTitleChanged',
    state: 'info',
    torrentItemId: 104,
    torrentTitle: 'Slow Horses',
    oldValue: 'Slow Horses S04 E01-E04',
    newValue: 'Slow Horses S04 E01-E06',
    isNotification: true,
    readAt: null,
    createdAt: Date.now() - 1000 * 60 * 120,
  },
  {
    id: 5,
    type: 'torrentSyncFailed',
    state: 'error',
    torrentItemId: 105,
    torrentTitle: 'Severance',
    oldValue: null,
    newValue: 'UpdateWorker: Error on fetch data, tracker timeout',
    isNotification: true,
    readAt: null,
    createdAt: Date.now() - 1000 * 60 * 160,
  },
  {
    id: 6,
    type: 'torrentDownloadStarted',
    state: 'info',
    torrentItemId: 106,
    torrentTitle: 'Foundation',
    oldValue: null,
    newValue: 'Download started',
    isNotification: true,
    readAt: null,
    createdAt: Date.now() - 1000 * 60 * 170,
  },
  {
    id: 7,
    type: 'torrentFileCopyCompleted',
    state: 'info',
    torrentItemId: 107,
    torrentTitle: 'Silo',
    oldValue: null,
    newValue:
      'Copied 2 file(s)\n/media/Silo/S02E01.mkv\n/media/Silo/S02E02.mkv',
    isNotification: false,
    readAt: Date.now() - 1000 * 60 * 60,
    createdAt: Date.now() - 1000 * 60 * 175,
  },
  {
    id: 8,
    type: 'torrentTitleChanged',
    state: 'info',
    torrentItemId: 108,
    torrentTitle: 'Foundation',
    oldValue: 'Foundation S03 2160p WEB-DL',
    newValue: 'Foundation S03 2160p WEB-DL HDR',
    isNotification: false,
    readAt: Date.now() - 1000 * 60 * 60,
    createdAt: Date.now() - 1000 * 60 * 180,
  },
];

function getMockEventJournalPage(page: number): EventJournalPageDto {
  const startIndex = (page - 1) * EVENTS_PAGE_LIMIT;
  const items = mockEventJournalItems.slice(
    startIndex,
    startIndex + EVENTS_PAGE_LIMIT
  );

  return {
    items,
    total: mockEventJournalItems.length,
    page,
    hasNext: startIndex + EVENTS_PAGE_LIMIT < mockEventJournalItems.length,
  };
}

function markMockEventAsRead(id: number): EventJournalDto {
  const event = mockEventJournalItems.find((item) => item.id === id);
  if (!event) {
    throw new Error('Event not found');
  }

  return {
    ...event,
    readAt: Date.now(),
  };
}

function markAllMockEventsAsRead(): EventJournalDto[] {
  const readAt = Date.now();
  return mockEventJournalItems
    .filter((event) => event.readAt === null)
    .map((event) => ({
      ...event,
      readAt,
    }));
}
