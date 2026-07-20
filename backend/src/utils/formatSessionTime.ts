// Formats an instant for a specific recipient with an explicit timezone
// abbreviation/offset, so the same email/notification reads unambiguously
// for a mentor and student in different zones instead of silently rendering
// in the server's own timezone with no indication of what zone that is.

function isValidTimezone(timezone?: string): boolean {
  if (!timezone) return true;

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    });

    return true;
  } catch {
    return false;
  }
}


export function formatSessionTime(date: Date, recipientTimezone?: string): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid session date.");
  }

  const timezone = isValidTimezone(recipientTimezone)
    ? recipientTimezone
    : undefined;

  return date.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
