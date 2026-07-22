export interface JoinableSession {
  mentor_id: string;
  student_id: string | null;
  status: string;
}

export type JoinDecision =
  | { action: 'reject'; status: number; error: string }
  | { action: 'noop' }
  | { action: 'claim' };

/**
 * Capacity context for group sessions (issue #169). When supplied, the join
 * decision is made against the session_participants count instead of the single
 * legacy `student_id` slot. Omitting it preserves the original single-participant
 * behaviour exactly.
 */
export interface GroupJoinContext {
  maxParticipants: number;
  participantCount: number;
  alreadyParticipant: boolean;
}

// Called while the session row is held under `SELECT ... FOR UPDATE`, so the
// 'reject' branch for a full session is what actually closes the double-booking
// race: concurrent joins to the same session serialize on the row lock, so each
// one sees an up-to-date participant count.
export function resolveJoinDecision(
  session: JoinableSession,
  studentId: string,
  group?: GroupJoinContext
): JoinDecision {
  const normalizedStudentId = studentId.trim();
  if (session.mentor_id === normalizedStudentId) {
    return { action: 'reject', status: 400, error: 'Mentors cannot join their own sessions' };
  }

  if (session.status === 'completed' || session.status === 'cancelled') {
    return { action: 'reject', status: 400, error: 'This session is no longer available to join' };
  }

  // Group-aware path: decide based on remaining capacity.
  if (group) {
    if (group.alreadyParticipant || session.student_id === normalizedStudentId) {
      return { action: 'noop' };
    }
    if (group.participantCount >= group.maxParticipants) {
      return { action: 'reject', status: 409, error: 'This session is full' };
    }
    return { action: 'claim' };
  }

  // Legacy single-participant path (unchanged).
  if (session.student_id === normalizedStudentId) {
    return { action: 'noop' };
  }

  if (session.student_id) {
    return { action: 'reject', status: 409, error: 'This session has already been joined by another student' };
  }

  return { action: 'claim' };
}
