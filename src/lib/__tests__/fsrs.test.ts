import { describe, it, expect } from 'vitest';
import { initCard, scheduleCard, computeRetrievability } from '../fsrs';

describe('FSRS-5 correctness', () => {
  const now = Date.now();
  const DAY = 86400000;

  it('first Good review gives stability ≈ 3.13', () => {
    const card = initCard();
    const after = scheduleCard(card, 3, now);
    expect(after.stability).toBeCloseTo(3.1262, 1);
  });

  it('retrievability at t=0 is ~1.0', () => {
    const card = initCard();
    const after = scheduleCard(card, 3, now);
    const R = computeRetrievability(after, now);
    expect(R).toBeGreaterThan(0.99);
  });

  it('retrievability at t=stability is ~0.9', () => {
    const card = initCard();
    const after = scheduleCard(card, 3, now);
    const R = computeRetrievability(after, now + after.stability * DAY);
    expect(R).toBeCloseTo(0.9, 1);
  });

  it('stability increases on consecutive Good reviews', () => {
    let c = initCard();
    let t = now;
    let prevS = 0;
    for (let i = 0; i < 5; i++) {
      c = scheduleCard(c, 3, t);
      expect(c.stability).toBeGreaterThan(prevS);
      prevS = c.stability;
      t += c.scheduledDays * DAY;
    }
  });

  it('stability drops sharply on Again', () => {
    let c = initCard();
    let t = now;
    for (let i = 0; i < 3; i++) {
      c = scheduleCard(c, 3, t);
      t += c.scheduledDays * DAY;
    }
    const beforeForget = c.stability;
    c = scheduleCard(c, 1, t);
    expect(c.stability).toBeLessThan(beforeForget * 0.5);
  });

  it('difficulty stays in [1, 10] after 20 consecutive forgets', () => {
    let c = initCard();
    let t = now;
    for (let i = 0; i < 20; i++) {
      c = scheduleCard(c, 1, t);
      expect(c.difficulty).toBeGreaterThanOrEqual(1);
      expect(c.difficulty).toBeLessThanOrEqual(10);
      t += Math.max(c.scheduledDays, 1) * DAY;
    }
  });

  it('Easy gives longer intervals than Good on first review', () => {
    const card = initCard();
    const afterGood = scheduleCard(card, 3, now);
    const afterEasy = scheduleCard(card, 4, now);
    expect(afterEasy.stability).toBeGreaterThan(afterGood.stability);
  });

  it('Hard gives shorter intervals than Good after some reviews', () => {
    let c = initCard();
    let t = now;
    c = scheduleCard(c, 3, t);
    t += c.scheduledDays * DAY;

    const afterGood = scheduleCard(c, 3, t);
    const afterHard = scheduleCard(c, 2, t);
    expect(afterHard.stability).toBeLessThan(afterGood.stability);
  });

  it('intervals grow roughly exponentially over 5 Good reviews', () => {
    let c = initCard();
    let t = now;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      c = scheduleCard(c, 3, t);
      intervals.push(c.scheduledDays);
      t += c.scheduledDays * DAY;
    }
    for (let i = 1; i < intervals.length; i++) {
      const ratio = intervals[i] / intervals[i - 1];
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(4.0);
    }
  });
});
