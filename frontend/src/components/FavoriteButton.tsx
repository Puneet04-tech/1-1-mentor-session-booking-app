'use client';

import { useState } from 'react';
import { apiClient } from '@/services/api';

interface FavoriteButtonProps {
  mentorId: string;
  favorited: boolean;
  onChange?: (mentorId: string, favorited: boolean) => void;
  className?: string;
}

/**
 * Heart toggle used on mentor cards to bookmark/favorite a mentor (issue #166).
 *
 * The favorited state is owned by the parent (so a single source of truth can
 * drive both the card and the "Saved Mentors" list); this component just
 * optimistically flips it and calls the API, reverting on failure.
 */
export default function FavoriteButton({
  mentorId,
  favorited,
  onChange,
  className = '',
}: FavoriteButtonProps) {
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    // Cards are often wrapped in a Link — don't navigate when toggling.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    const next = !favorited;
    setBusy(true);
    // Optimistically reflect the new state.
    onChange?.(mentorId, next);
    try {
      if (next) {
        await apiClient.addFavorite(mentorId);
      } else {
        await apiClient.removeFavorite(mentorId);
      }
    } catch (err) {
      console.error('Failed to update favorite:', err);
      // Revert on failure.
      onChange?.(mentorId, favorited);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={favorited}
      aria-label={favorited ? 'Remove from saved mentors' : 'Save mentor'}
      title={favorited ? 'Remove from saved mentors' : 'Save mentor'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors
        ${favorited
          ? 'text-red-500 hover:text-red-600'
          : 'text-gray-400 hover:text-red-500'}
        hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <span className="text-xl leading-none">{favorited ? '♥' : '♡'}</span>
    </button>
  );
}
