import { describe, expect, it } from 'vitest';

import { redactSensitiveUrl } from '@server/shared/url-redaction.utils';

describe('redactSensitiveUrl', () => {
  it('redacts sensitive query values case-insensitively', () => {
    const redacted = redactSensitiveUrl(
      'https://jackett.test/api?apikey=secret-one&API_KEY=secret-two&Query=show',
    );

    expect(redacted).not.toContain('secret-one');
    expect(redacted).not.toContain('secret-two');
    expect(redacted).toContain('apikey=[REDACTED]');
    expect(redacted).toContain('API_KEY=[REDACTED]');
    expect(redacted).toContain('Query=show');
  });

  it('removes URL credentials', () => {
    const redacted = redactSensitiveUrl(
      'https://username:password@jackett.test/api?Query=show',
    );

    expect(redacted).toBe('https://jackett.test/api?Query=show');
  });

  it('redacts sensitive values in malformed URL text', () => {
    const redacted = redactSensitiveUrl(
      'request failed for not-a-url?apikey=secret&Query=show',
    );

    expect(redacted).toBe(
      'request failed for not-a-url?apikey=[REDACTED]&Query=show',
    );
  });

  it('keeps non-sensitive URL unchanged', () => {
    expect(redactSensitiveUrl('https://jackett.test/api?Query=show')).toBe(
      'https://jackett.test/api?Query=show',
    );
  });
});
