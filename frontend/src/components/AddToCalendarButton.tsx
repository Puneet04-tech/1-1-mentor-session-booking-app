'use client';

import { useState } from 'react';
import { apiClient } from '@/services/api';

interface AddToCalendarButtonProps {
  sessionId: string;
  filename?: string;
  className?: string;
}

/**
 * Downloads a session's .ics file and hands it to the browser (issue #167).
 *
 * The export endpoint requires the auth header, so a plain anchor link won't
 * work — we fetch the file as a blob with the api client and trigger a download
 * via a temporary object URL.
 */
export default function AddToCalendarButton({
  sessionId,
  filename = 'session.ics',
  className = '',
}: AddToCalendarButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    setBusy(true);
    setError(false);
    try {
      const blob = await apiClient.downloadSessionIcs(sessionId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download calendar file:', err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      title="Add this session to your calendar"
      className={`inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400
        hover:text-primary-700 dark:hover:text-primary-300 underline transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <span aria-hidden="true">📅</span>
      {busy ? 'Preparing…' : error ? 'Retry download' : 'Add to Calendar'}
    </button>
  );
}
