// iCalendar (.ics) generation for booked sessions (issue #167).
//
// Produces an RFC 5545 VCALENDAR/VEVENT document so a session can be added to
// Google / Apple / Outlook calendars. Kept as a pure function (no DB/HTTP) so
// the formatting can be unit-tested in isolation.

export interface IcsSession {
  id: string;
  title: string;
  description?: string | null;
  topic?: string | null;
  scheduled_at: string | Date;
  duration_minutes?: number | null;
  location?: string | null;
}

const DEFAULT_DURATION_MINUTES = 60;

// RFC 5545 §3.3.11: escape backslash, semicolon, comma and newlines in TEXT
// values. Order matters — backslash must be escaped first.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

// Format a Date as a UTC timestamp in iCalendar "form 2" basic format:
// YYYYMMDDTHHMMSSZ.
function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// RFC 5545 §3.1: content lines SHOULD be folded at 75 octets. Continuation
// lines start with a single space. We fold on octet (UTF-8 byte) boundaries.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    // First line holds 75 octets; continuation lines hold 74 (the leading
    // space counts toward the 75-octet limit).
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

/**
 * Build an .ics document (with CRLF line endings) for a single session.
 * Throws if the session has no valid `scheduled_at`, since an event needs a
 * start time.
 */
export function generateSessionIcs(session: IcsSession, now: Date = new Date()): string {
  const start = new Date(session.scheduled_at);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Session has no valid scheduled time");
  }

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Invalid generation timestamp");
  }

  const durationMinutes =
    session.duration_minutes && session.duration_minutes > 0
      ? session.duration_minutes
      : DEFAULT_DURATION_MINUTES;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const descriptionParts: string[] = [];
  if (session.description) descriptionParts.push(session.description);
  if (session.topic) descriptionParts.push(`Topic: ${session.topic}`);
  const description = descriptionParts.join('\n');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//1-1 Mentor Session Booking//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:session-${session.id}@mentor-booking`,
    `DTSTAMP:${formatUtcTimestamp(now)}`,
    `DTSTART:${formatUtcTimestamp(start)}`,
    `DTEND:${formatUtcTimestamp(end)}`,
    `SUMMARY:${escapeText(session.title || 'Mentoring Session')}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeText(description)}`);
  }
  if (session.location) {
    lines.push(`LOCATION:${escapeText(session.location)}`);
  }

  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Safe, ASCII filename for the Content-Disposition header. */
export function icsFilename(session: Pick<IcsSession, 'id' | 'title'>): string {
  const base = (session.title || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'session';
  return `${base}.ics`;
}
