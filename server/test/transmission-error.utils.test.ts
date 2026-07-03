import { describe, expect, it } from 'vitest';
import { normalizeTransmissionError } from '@server/external/adapters/transmission/transmission-error.utils';

describe('normalizeTransmissionError', () => {
  it('describes a request failure without an HTTP response', () => {
    const error = new TypeError(
      "undefined is not an object (evaluating 'G.response.status')",
    );

    expect(normalizeTransmissionError(error).message).toBe(
      'Transmission request failed without an HTTP response',
    );
  });

  it('preserves errors that already contain a useful message', () => {
    const error = new Error('Torrent not found');

    expect(normalizeTransmissionError(error)).toBe(error);
  });
});
