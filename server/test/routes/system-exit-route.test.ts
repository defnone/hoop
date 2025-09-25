import { describe, it, expect, vi } from 'vitest';
import { systemExitRoute } from '@server/routes/system.exit';

describe('systemExitRoute', () => {
  it('invokes process exit with code 0', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number | undefined) => {
        void code;
        return undefined as never;
      }) as (code?: number | undefined) => never);

    try {
      const response = await systemExitRoute.request('/', { method: 'POST' });
      expect(response.status).toBe(404);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
