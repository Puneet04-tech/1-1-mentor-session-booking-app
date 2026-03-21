'use client';

import { useState } from 'react';
import { apiClient } from '@/services/api';
import { GlowingButton, GlowingCard } from '@/components/ui/GlowingComponents';

interface VideoLinkGeneratorProps {
  sessionId: string;
  isMentor: boolean;
  onLinkGenerated?: (link: string) => void;
}

export function VideoLinkGenerator({ sessionId, isMentor, onLinkGenerated }: VideoLinkGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    if (!isMentor) return;

    try {
      setLoading(true);
      setError(null);

      console.log('📝 Generating video link for session:', sessionId);
      const response = await apiClient.generateVideoLink(sessionId);

      if (!response?.data?.linkUrl) {
        throw new Error('Failed to generate link');
      }

      console.log('✅ Video link generated');
      setLink(response.data.linkUrl);
      onLinkGenerated?.(response.data.linkUrl);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to generate video link';
      console.error('❌ Error generating link:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isMentor) {
    return null;
  }

  if (link) {
    return (
      <GlowingCard glow="green" className="p-4">
        <div className="space-y-4">
          <h3 className="font-bold text-white mb-2">📎 Video Conference Link</h3>
          <div className="bg-dark-800 rounded p-3 break-all text-sm text-gray-300 font-mono">
            {link}
          </div>
          <div className="flex gap-2">
            <GlowingButton
              variant="primary"
              onClick={copyToClipboard}
              className="flex-1 text-sm py-2"
            >
              {copied ? '✅ Copied!' : '📋 Copy Link'}
            </GlowingButton>
            <GlowingButton
              variant="secondary"
              onClick={() => setLink(null)}
              className="flex-1 text-sm py-2"
            >
              🔄 New Link
            </GlowingButton>
          </div>
          <p className="text-xs text-gray-400 text-center">
            ℹ️ Share this link with the student to start the video conference
          </p>
        </div>
      </GlowingCard>
    );
  }

  return (
    <GlowingCard glow="blue" className="p-4">
      <div className="space-y-3">
        <h3 className="font-bold text-white mb-2">🔗 Video Conference</h3>
        {error && (
          <p className="text-red-400 text-sm">❌ {error}</p>
        )}
        <GlowingButton
          onClick={generateLink}
          disabled={loading}
          className="w-full text-sm py-2"
        >
          {loading ? '⏳ Generating...' : '🎬 Generate Video Link'}
        </GlowingButton>
        <p className="text-xs text-gray-400 text-center">
          Generate a shareable link to start video conferencing
        </p>
      </div>
    </GlowingCard>
  );
}
