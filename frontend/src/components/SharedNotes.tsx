'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient } from '@/services/api';
import { socketService } from '@/services/socket';

interface Props {
  sessionId: string;
  currentUserId: string;
  isOpen: boolean;
  onToggle: () => void;
}

const AUTOSAVE_DELAY = 1500; // ms

export function SharedNotes({ sessionId, currentUserId, isOpen, onToggle }: Props) {
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const debounceRef           = useRef<NodeJS.Timeout | null>(null);
  const isRemoteUpdate        = useRef(false);

  // ── Load notes on mount ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getSessionNotes(sessionId);
        setNotes(res.notes ?? '');
      } catch {
        // silently ignore if column doesn't exist yet
      }
    })();
  }, [sessionId]);

  // ── Listen for real-time updates from the other participant ──────────────
  useEffect(() => {
    const handleRemoteNotes = (data: { notes: string; userId: string }) => {
      if (data.userId === currentUserId) return; // our own echo
      isRemoteUpdate.current = true;
      setNotes(data.notes);
    };

    socketService.on('notes:update', handleRemoteNotes);
    return () => socketService.off('notes:update', handleRemoteNotes);
  }, [currentUserId]);

  // ── Debounced save + emit ─────────────────────────────────────────────────
  const handleChange = useCallback((value: string) => {
    setNotes(value);
    setSaved(false);

    // Broadcast to the other participant
    if (socketService.isConnected()) {
      socketService.emit('notes:update', { sessionId, notes: value, userId: currentUserId } as any);
    }

    // Auto-save to DB after delay
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await apiClient.saveSessionNotes(sessionId, value);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_DELAY);
  }, [sessionId, currentUserId]);

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div
      className={`flex flex-col transition-all duration-300 ease-in-out
        ${isOpen ? 'w-72 min-w-[280px]' : 'w-10 min-w-[40px]'}
        bg-dark-900/80 backdrop-blur border-l border-gray-700/30 overflow-hidden`}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-gray-700/30 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
        title={isOpen ? 'Collapse notes' : 'Open shared notes'}
      >
        <div className={`flex items-center gap-2 ${!isOpen && 'justify-center w-full'}`}>
          <span className="text-lg">📝</span>
          {isOpen && <span className="text-white font-semibold text-sm">Shared Notes</span>}
        </div>
        {isOpen && (
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-gray-500 animate-pulse">saving…</span>}
            {saved  && <span className="text-[10px] text-green-400">✓ saved</span>}
            <span className="text-gray-500 text-xs">◀</span>
          </div>
        )}
      </div>

      {/* ── Notepad ── */}
      {isOpen && (
        <div className="flex flex-col flex-1 p-3 gap-2">
          <p className="text-[11px] text-gray-500">
            Real-time — both participants can edit simultaneously
          </p>
          <textarea
            id="shared-notes-textarea"
            value={notes}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Start typing notes here…&#10;&#10;✓ Shared with your session partner&#10;✓ Auto-saved to database&#10;✓ Available in session history"
            spellCheck
            className="flex-1 w-full bg-dark-800/60 border border-gray-700/30 rounded-lg
              text-gray-200 text-sm p-3 resize-none leading-relaxed
              focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30
              placeholder-gray-600 min-h-[300px]
              transition-all duration-200"
          />
          <div className="flex justify-between items-center text-[11px] text-gray-600">
            <span>{notes.length} chars</span>
            <span>{notes.split(/\s+/).filter(Boolean).length} words</span>
          </div>
        </div>
      )}
    </div>
  );
}
