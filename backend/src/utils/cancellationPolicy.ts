export function isWithinCancellationWindow(scheduledAt: string | Date, minNoticeHours: number): boolean {
  const scheduledTime = new Date(scheduledAt).getTime();

  if (Number.isNaN(scheduledTime)) {
    return false;
  }

  const hoursUntil = (scheduledTime - Date.now()) / (1000 * 60 * 60);

  return hoursUntil < minNoticeHours;
}