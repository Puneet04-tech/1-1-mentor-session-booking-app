import {
  validateRescheduleRequest,
  hasSchedulingConflict,
  intervalsOverlap,
  ReschedulableSession,
} from './reschedulePolicy';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

function session(overrides: Partial<ReschedulableSession> = {}): ReschedulableSession {
  return {
    mentor_id: 'mentor-1',
    student_id: 'student-1',
    status: 'scheduled',
    scheduled_at: new Date(NOW + 48 * HOUR).toISOString(), // 2 days out
    ...overrides,
  };
}

describe('validateRescheduleRequest (issue #145)', () => {
  const minNoticeHours = 2;
  const newTime = new Date(NOW + 72 * HOUR).toISOString();

  it('accepts a valid reschedule by the mentor', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'mentor-1',
      newScheduledAt: newTime,
      minNoticeHours,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a valid reschedule by the booked student', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'student-1',
      newScheduledAt: newTime,
      minNoticeHours,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-participant with 403', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'stranger',
      newScheduledAt: newTime,
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects rescheduling a non-scheduled session', () => {
    const result = validateRescheduleRequest({
      session: session({ status: 'cancelled' }),
      userId: 'mentor-1',
      newScheduledAt: newTime,
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) expect(result.error).toContain('cancelled');
  });

  it('rejects an invalid new date', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'mentor-1',
      newScheduledAt: 'not-a-date',
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a new time in the past', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'mentor-1',
      newScheduledAt: new Date(NOW - HOUR).toISOString(),
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a missing new time', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'mentor-1',
      newScheduledAt: '',
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects when the new time equals the current time', () => {
    const current = new Date(NOW + 48 * HOUR).toISOString();
    const result = validateRescheduleRequest({
      session: session({ scheduled_at: current }),
      userId: 'mentor-1',
      newScheduledAt: current,
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects when the CURRENT start is inside the notice window', () => {
    const result = validateRescheduleRequest({
      session: session({ scheduled_at: new Date(NOW + 1 * HOUR).toISOString() }),
      userId: 'mentor-1',
      newScheduledAt: newTime,
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) expect(result.error).toContain('at least 2 hours before');
  });

  it('rejects when the NEW time is inside the notice window', () => {
    const result = validateRescheduleRequest({
      session: session(),
      userId: 'mentor-1',
      newScheduledAt: new Date(NOW + 1 * HOUR).toISOString(),
      minNoticeHours,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (!result.ok) expect(result.error).toContain('at least 2 hours from now');
  });
});

describe('intervalsOverlap', () => {
  const base = new Date('2026-07-10T10:00:00.000Z');
  it('detects overlapping intervals', () => {
    const later = new Date('2026-07-10T10:30:00.000Z');
    expect(intervalsOverlap(base, 60, later, 60)).toBe(true);
  });
  it('treats back-to-back (touching) intervals as non-overlapping', () => {
    const after = new Date('2026-07-10T11:00:00.000Z');
    expect(intervalsOverlap(base, 60, after, 60)).toBe(false);
  });
  it('returns false for clearly separate intervals', () => {
    const far = new Date('2026-07-10T14:00:00.000Z');
    expect(intervalsOverlap(base, 60, far, 60)).toBe(false);
  });
});

describe('hasSchedulingConflict', () => {
  const newStart = new Date('2026-07-10T10:00:00.000Z');

  it('returns true when the mentor already has an overlapping session', () => {
    const conflict = hasSchedulingConflict(newStart, 60, [
      { scheduled_at: '2026-07-10T10:30:00.000Z', duration_minutes: 60 },
    ]);
    expect(conflict).toBe(true);
  });

  it('returns false when there are no overlaps', () => {
    const conflict = hasSchedulingConflict(newStart, 60, [
      { scheduled_at: '2026-07-10T12:00:00.000Z', duration_minutes: 60 },
      { scheduled_at: '2026-07-09T10:00:00.000Z', duration_minutes: 60 },
    ]);
    expect(conflict).toBe(false);
  });

  it('ignores rows with null/invalid scheduled_at', () => {
    const conflict = hasSchedulingConflict(newStart, 60, [
      { scheduled_at: null, duration_minutes: 60 },
      { scheduled_at: 'garbage', duration_minutes: 60 },
    ]);
    expect(conflict).toBe(false);
  });

  it('defaults missing duration to 60 minutes', () => {
    const conflict = hasSchedulingConflict(newStart, 60, [
      { scheduled_at: '2026-07-10T10:45:00.000Z' },
    ]);
    expect(conflict).toBe(true);
  });
});
