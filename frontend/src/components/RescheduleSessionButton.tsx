'use client';

import { useState } from 'react';
import { apiClient } from '@/services/api';

interface RescheduleSessionButtonProps {
  sessionId: string;
  scheduledAt?: string;
  onRescheduled: (newScheduledAt: string) => void;
}

const MIN_NOTICE_HOURS = parseInt(process.env.NEXT_PUBLIC_MIN_CANCEL_NOTICE_HOURS ?? '2', 10);

/** Format a Date into the value a <input type="datetime-local"> expects (local time). */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RescheduleSessionButton({
  sessionId,
  scheduledAt,
  onRescheduled,
}: RescheduleSessionButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursUntilStart = scheduledAt
    ? (new Date(scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60)
    : Infinity;
  const withinWindow = hoursUntilStart < MIN_NOTICE_HOURS;

  // Earliest selectable slot: now + the minimum notice window.
  const minSelectable = toDatetimeLocalValue(new Date(Date.now() + MIN_NOTICE_HOURS * 60 * 60 * 1000));

  const openDialog = () => {
    setError(null);
    setNewTime(scheduledAt ? toDatetimeLocalValue(new Date(scheduledAt)) : '');
    setShowDialog(true);
  };

  const handleReschedule = async () => {
    if (!newTime) {
      setError('Please pick a new date and time.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // datetime-local has no timezone; interpret it in the user's local zone.
      const iso = new Date(newTime).toISOString();
      await apiClient.rescheduleSession(sessionId, iso);
      setShowDialog(false);
      onRescheduled(iso);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : 'Failed to reschedule session.');
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-sm text-blue-400 hover:text-blue-300 underline transition-colors mt-2 mr-4"
      >
        Reschedule
      </button>

      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-dialog-title"
        >
          <div className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-2xl">
            <h2
              id="reschedule-dialog-title"
              className="text-gray-900 dark:text-white font-semibold text-lg mb-2"
            >
              Reschedule this session?
            </h2>

            {withinWindow ? (
              <>
                <p className="text-red-500 text-sm mb-4">
                  It&apos;s too late to reschedule online — this session starts in less than{' '}
                  {MIN_NOTICE_HOURS} hours. Please contact the other participant directly.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  className="w-full py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                  Pick a new time at least {MIN_NOTICE_HOURS} hours from now. Both participants will
                  be notified by email.
                </p>

                <div className="mb-4">
                  <label
                    htmlFor="reschedule-time"
                    className="block text-gray-500 dark:text-gray-400 text-xs mb-1"
                  >
                    New date & time
                  </label>
                  <input
                    id="reschedule-time"
                    type="datetime-local"
                    value={newTime}
                    min={minSelectable}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                               text-gray-900 dark:text-white text-sm rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDialog(false);
                      setError(null);
                    }}
                    disabled={isSaving}
                    className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-100
                               dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    Keep current time
                  </button>
                  <button
                    type="button"
                    onClick={handleReschedule}
                    disabled={isSaving}
                    className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold
                               hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : 'Reschedule'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
