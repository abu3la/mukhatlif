import { describe, expect, it } from 'vitest';
import { clampMediaTime, finiteMediaTime, formatPlaybackTime } from './player-utils';

describe('formatPlaybackTime', () => {
  it('formats short and long episodes as a compact media clock', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(65.9)).toBe('1:05');
    expect(formatPlaybackTime(3661)).toBe('1:01:01');
  });

  it('does not leak invalid media values into the interface', () => {
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
    expect(formatPlaybackTime(-20)).toBe('0:00');
    expect(finiteMediaTime(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('clampMediaTime', () => {
  it('keeps seeks inside a known duration', () => {
    expect(clampMediaTime(-15, 120)).toBe(0);
    expect(clampMediaTime(70, 120)).toBe(70);
    expect(clampMediaTime(140, 120)).toBe(120);
  });

  it('allows a non-negative seek while metadata is still unknown', () => {
    expect(clampMediaTime(20, 0)).toBe(20);
  });
});
