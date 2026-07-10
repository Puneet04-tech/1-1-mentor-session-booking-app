import { generateSessionIcs, icsFilename } from './icsGenerator';

describe('generateSessionIcs', () => {
  const base = {
    id: 'sess-123',
    title: 'Intro to React',
    description: 'Hooks and state',
    topic: 'React',
    scheduled_at: '2026-08-01T14:00:00.000Z',
    duration_minutes: 90,
  };
  const now = new Date('2026-07-10T00:00:00.000Z');

  it('produces a well-formed VCALENDAR/VEVENT document', () => {
    const ics = generateSessionIcs(base, now);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('UID:session-sess-123@mentor-booking');
    expect(ics).toContain('SUMMARY:Intro to React');
  });

  it('uses CRLF line endings', () => {
    const ics = generateSessionIcs(base, now);
    expect(ics).toContain('\r\n');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('formats DTSTART and computes DTEND from duration', () => {
    const ics = generateSessionIcs(base, now);
    expect(ics).toContain('DTSTART:20260801T140000Z');
    // 14:00 + 90 minutes = 15:30
    expect(ics).toContain('DTEND:20260801T153000Z');
    expect(ics).toContain('DTSTAMP:20260710T000000Z');
  });

  it('defaults to a 60-minute duration when unset', () => {
    const ics = generateSessionIcs({ ...base, duration_minutes: null }, now);
    expect(ics).toContain('DTEND:20260801T150000Z');
  });

  it('escapes special characters in text values', () => {
    const ics = generateSessionIcs(
      { ...base, title: 'A; B, C\\D', description: 'line1\nline2' },
      now
    );
    expect(ics).toContain('SUMMARY:A\\; B\\, C\\\\D');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });

  it('includes the topic in the description', () => {
    const ics = generateSessionIcs(base, now);
    expect(ics).toContain('Topic: React');
  });

  it('throws when the session has no valid scheduled time', () => {
    expect(() => generateSessionIcs({ ...base, scheduled_at: 'not-a-date' }, now)).toThrow();
  });
});

describe('icsFilename', () => {
  it('slugifies the title', () => {
    expect(icsFilename({ id: 'x', title: 'Intro to React!' })).toBe('intro-to-react.ics');
  });

  it('falls back to session.ics when title is empty', () => {
    expect(icsFilename({ id: 'x', title: '' })).toBe('session.ics');
  });
});
