import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventJournalRoute } from '@server/routes/event-journal';
import { eventJournalReadRoute } from '@server/routes/event-journal.$id.read';
import { eventJournalReadAllRoute } from '@server/routes/event-journal.read-all';
import { Hono } from 'hono/tiny';
import type {
  EventJournalDto,
  EventJournalPageDto,
} from '@server/features/event-journal/event-journal.types';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const { getAllMock, markAsReadMock, markAllAsReadMock, deleteAllMock } =
  vi.hoisted(() => {
    const getAllMock =
      vi.fn<(page: number, limit: number) => Promise<EventJournalPageDto>>();
    const markAsReadMock =
      vi.fn<(id: number) => Promise<EventJournalDto | null>>();
    const markAllAsReadMock = vi.fn<() => Promise<EventJournalDto[]>>();
    const deleteAllMock = vi.fn<() => Promise<number>>();
    return {
      getAllMock,
      markAsReadMock,
      markAllAsReadMock,
      deleteAllMock,
    } as const;
  });

vi.mock('@server/features/event-journal/event-journal.service', () => ({
  EventJournalService: class {
    async getAll(page: number, limit: number): Promise<EventJournalPageDto> {
      return await getAllMock(page, limit);
    }

    async markAsRead(id: number): Promise<EventJournalDto | null> {
      return await markAsReadMock(id);
    }

    async markAllAsRead(): Promise<EventJournalDto[]> {
      return await markAllAsReadMock();
    }

    async deleteAll(): Promise<number> {
      return await deleteAllMock();
    }
  },
}));

const event: EventJournalDto = {
  id: 1,
  type: 'torrentTitleChanged',
  state: 'info',
  torrentItemId: 7,
  torrentTitle: 'Some Show',
  oldValue: 'Old title',
  newValue: 'New title',
  isNotification: true,
  readAt: null,
  createdAt: 1000,
};

function mountRoute(path: string, route: Hono) {
  const app = new Hono();
  app.route(path, route);
  return app;
}

describe('eventJournalRoute', () => {
  beforeEach(() => {
    getAllMock.mockReset();
    markAsReadMock.mockReset();
    markAllAsReadMock.mockReset();
    deleteAllMock.mockReset();
  });

  it('returns paginated journal events', async () => {
    getAllMock.mockResolvedValueOnce({
      items: [event],
      total: 1,
      page: 1,
      hasNext: false,
    });

    const response = await eventJournalRoute.request('/?page=1&limit=30');
    const body = (await response.json()) as ApiResponse<EventJournalPageDto>;

    expect(response.status).toBe(200);
    expect(getAllMock).toHaveBeenCalledWith(1, 30);
    expect(body.data?.items[0]?.torrentTitle).toBe('Some Show');
  });

  it('marks event as read', async () => {
    const readEvent: EventJournalDto = { ...event, readAt: 2000 };
    markAsReadMock.mockResolvedValueOnce(readEvent);
    const app = mountRoute('/event-journal/:id/read', eventJournalReadRoute);

    const response = await app.request('/event-journal/1/read', {
      method: 'PUT',
    });
    const body = (await response.json()) as ApiResponse<EventJournalDto>;

    expect(response.status).toBe(200);
    expect(markAsReadMock).toHaveBeenCalledWith(1);
    expect(body.data?.readAt).toBe(2000);
  });

  it('returns not found when event does not exist', async () => {
    markAsReadMock.mockResolvedValueOnce(null);
    const app = mountRoute('/event-journal/:id/read', eventJournalReadRoute);

    const response = await app.request('/event-journal/99/read', {
      method: 'PUT',
    });
    const body = (await response.json()) as ApiResponse<null>;

    expect(response.status).toBe(404);
    expect(body.message).toBe('Event not found');
  });

  it('marks all events as read', async () => {
    const readEvents: EventJournalDto[] = [
      { ...event, readAt: 3000 },
      { ...event, id: 2, readAt: 3000 },
    ];
    markAllAsReadMock.mockResolvedValueOnce(readEvents);

    const response = await eventJournalReadAllRoute.request('/', {
      method: 'PUT',
    });
    const body = (await response.json()) as ApiResponse<EventJournalDto[]>;

    expect(response.status).toBe(200);
    expect(markAllAsReadMock).toHaveBeenCalledTimes(1);
    expect(body.data?.map((item) => item.id)).toEqual([1, 2]);
  });

  it('deletes all journal events', async () => {
    deleteAllMock.mockResolvedValueOnce(2);

    const response = await eventJournalRoute.request('/', { method: 'DELETE' });
    const body = (await response.json()) as ApiResponse<number>;

    expect(response.status).toBe(200);
    expect(deleteAllMock).toHaveBeenCalledTimes(1);
    expect(body.data).toBe(2);
  });
});
