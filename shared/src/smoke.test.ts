import { describe, expect, it } from 'vitest';

describe('shared smoke', () => {
  it('basic arithmetic works', () => {
    const sum: number = 2 + 2;
    expect(sum).toBe(4);
  });
});

