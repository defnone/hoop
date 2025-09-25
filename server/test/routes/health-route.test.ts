import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healthRoute } from '@server/routes/health';

const { usersCountStorage } = vi.hoisted(() => ({
  usersCountStorage: new Map<string, number>(),
}));

vi.mock('@server/lib/utils', () => ({
  usersCountStorage,
}));

type HealthResponse = {
  success: boolean;
  message?: string;
};

describe('healthRoute', () => {
  beforeEach(() => {
    usersCountStorage.clear();
  });

  it('returns "First run" when there are no users', async () => {
    usersCountStorage.set('count', 0);

    const response = await healthRoute.request('/');
    const body = (await response.json()) as HealthResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('First run');
  });

  it('returns "OK" when users exist', async () => {
    usersCountStorage.set('count', 3);

    const response = await healthRoute.request('/');
    const body = (await response.json()) as HealthResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('OK');
  });
});
