import { describe, expect, it } from 'vitest';
import { mapConcurrent } from './network.ts';

describe('audio migration network helpers', () => {
  it('keeps input ordering while bounding concurrent tasks', async () => {
    let active = 0;
    let maximum = 0;
    const values = await mapConcurrent([4, 3, 2, 1], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active -= 1;
      return value * 2;
    });
    expect(values).toEqual([8, 6, 4, 2]);
    expect(maximum).toBeLessThanOrEqual(2);
  });
});
