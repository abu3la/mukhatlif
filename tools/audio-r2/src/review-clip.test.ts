import { describe, expect, it } from 'vitest';
import { clipBounds } from './review-clip.ts';

describe('bounded local audio review', () => {
  it('accepts only a short interval within the reviewed source', () => {
    expect(clipBounds(90, 60, 600)).toEqual({ start: 90, seconds: 60 });
    for (const args of [
      [-1, 30, 600],
      [0, 91, 600],
      [590, 30, 600],
      [0, 0, 600],
      [NaN, 30, 600],
      [0, Infinity, 600],
      [0, 30, NaN],
    ])
      expect(() => clipBounds(args[0]!, args[1]!, args[2]!)).toThrow();
  });
});
