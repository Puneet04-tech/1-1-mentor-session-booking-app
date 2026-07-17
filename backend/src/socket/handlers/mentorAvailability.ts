import { Socket } from 'socket.io';

export function mentorAvailabilityRoom(mentorId: string): string {
  return `mentor-availability:${mentorId}`;
}

// Anyone (any authenticated viewer, not just the mentor) can watch a
// mentor's profile for live availability changes — there's no participant
// restriction here the way there is for session-scoped rooms.
export function handleMentorProfileWatch(socket: Socket, mentorId: string) {
  if (typeof mentorId !== "string") {
    return;
  }

  const normalizedMentorId = mentorId.trim();

  if (!normalizedMentorId) {
    return;
  }

  socket.join(mentorAvailabilityRoom(normalizedMentorId));
}

export function handleMentorProfileUnwatch(socket: Socket, mentorId: string) {
  if (typeof mentorId !== "string") {
    return;
  }

  const normalizedMentorId = mentorId.trim();

  if (!normalizedMentorId) {
    return;
  }

  socket.leave(mentorAvailabilityRoom(normalizedMentorId));
}
