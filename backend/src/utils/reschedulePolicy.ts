/**
 * Pure decision logic for the session reschedule flow (issue #145).
 *
 * Kept free of DB/Express so every branch (non-participant, timing violations,
 * conflicts, success) is directly unit-testable. The route handler layers the
 * actual DB lookups (mentor availability conflicts) on top of these checks.
 */

export interface ReschedulableSession {
  mentor_id: string;
  student_id: string | null;
  status: string;
  scheduled_at: string | Date | null;
}

export type RescheduleDecision =
  | { ok: true; newScheduledAt: Date }
  | { ok: false; status: number; error: string };

export interface ValidateRescheduleParams {
  session: ReschedulableSession;
  userId: string;
  newScheduledAt: unknown;
  minNoticeHours: number;
  now?: number;
}

/**
 * Validate a reschedule request against participant, status, and notice-window
 * rules (the notice window matches the cancellation policy). Availability
 * conflict checks are done separately by the caller since they need the DB.
 */
export function validateRescheduleRequest(params: ValidateRescheduleParams): RescheduleDecision {
  const { session, userId, newScheduledAt, minNoticeHours } = params;
  const now = params.now ?? Date.now();

  // Must be a participant (mentor or the booked student).
  if (session.mentor_id !== userId && session.student_id !== userId) {
    return { ok: false, status: 403, error: 'You are not a participant in this session' };
  }

  // Only upcoming, still-scheduled sessions can be moved (mirrors cancellation).
  if (session.status !== 'scheduled') {
    return { ok: false, status: 400, error: `Cannot reschedule a session with status '${session.status}'` };
  }

  // New time must be a valid, future timestamp.
  if (newScheduledAt === undefined || newScheduledAt === null || newScheduledAt === '') {
    return { ok: false, status: 400, error: 'A new scheduled time is required' };
  }
  const newDate = new Date(newScheduledAt as string);
  if (Number.isNaN(newDate.getTime())) {
    return { ok: false, status: 400, error: 'newScheduledAt must be a valid date' };
  }
  if (newDate.getTime() <= now) {
    return { ok: false, status: 400, error: 'New scheduled time must be in the future' };
  }

  // Reschedule to a different time than the current one.
  if (session.scheduled_at && new Date(session.scheduled_at).getTime() === newDate.getTime()) {
    return { ok: false, status: 400, error: 'New scheduled time is the same as the current time' };
  }

  // Notice window on the CURRENT start — can't move a session that's already
  // within the cancellation/reschedule cutoff of starting.
  if (session.scheduled_at) {
    const hoursUntilCurrent = (new Date(session.scheduled_at).getTime() - now) / (1000 * 60 * 60);
    if (hoursUntilCurrent < minNoticeHours) {
      return {
        ok: false,
        status: 400,
        error: `Sessions must be rescheduled at least ${minNoticeHours} hours before they start`,
      };
    }
  }

  // The new slot itself must respect the same minimum notice.
  const hoursUntilNew = (newDate.getTime() - now) / (1000 * 60 * 60);
  if (hoursUntilNew < minNoticeHours) {
    return {
      ok: false,
      status: 400,
      error: `New scheduled time must be at least ${minNoticeHours} hours from now`,
    };
  }

  return { ok: true, newScheduledAt: newDate };
}

export interface TimedSession {
  scheduled_at: string | Date | null;
  duration_minutes?: number | null;
}

const DEFAULT_DURATION_MIN = 60;

/** Do two [start, start+duration) intervals overlap? */
export function intervalsOverlap(
  startA: Date,
  durationMinA: number,
  startB: Date,
  durationMinB: number
): boolean {
  const endA = startA.getTime() + durationMinA * 60 * 1000;
  const endB = startB.getTime() + durationMinB * 60 * 1000;
  return startA.getTime() < endB && startB.getTime() < endA;
}

/**
 * Given the mentor's other active sessions, does the proposed slot collide with
 * any of them? Used to return 409 on double-booking.
 */
export function hasSchedulingConflict(
  newStart: Date,
  newDurationMin: number,
  otherSessions: TimedSession[]
): boolean {
  const dur = newDurationMin > 0 ? newDurationMin : DEFAULT_DURATION_MIN;
  return otherSessions.some((s) => {
    if (!s.scheduled_at) return false;
    const otherStart = new Date(s.scheduled_at);
    if (Number.isNaN(otherStart.getTime())) return false;
    const otherDur = s.duration_minutes && s.duration_minutes > 0 ? s.duration_minutes : DEFAULT_DURATION_MIN;
    return intervalsOverlap(newStart, dur, otherStart, otherDur);
  });
}
