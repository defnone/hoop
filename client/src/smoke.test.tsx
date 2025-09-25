import { describe, expect, it } from 'vitest';

describe('client smoke', () => {
  it('basic arithmetic works', () => {
    const sum: number = 1 + 1;
    expect(sum).toBe(2);
  });
});

