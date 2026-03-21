'use client';

import { useState, useEffect } from 'react';
import { GlowingButton, GlowingCard } from '@/components/ui/GlowingComponents';
import { apiClient } from '@/services/api';

interface VideoLinkModalProps {
  sessionId: string;
  isMentor: boolean;
  onLinkGenerated?: (linkUrl: string) => void;
  onClose?: () => void;
}

export function VideoLinkModal({ sessionId, isMentor, onLinkGenerated, onClose }: VideoLinkModalProps) {
  const [loading, setLoading] = useState(!isMentor);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-generate link for mentor
  useEffect(() => {
    if (!isMentor) return; // Student doesn't generate link

    const generateLink = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔗 Generating video conference link...');
        const response = await apiClient.generateVideoLink(sessionId);

        if (!response?.data?.linkUrl) {
          throw new Error('Failed to generate video link');
        }

        console.log('✅ Video link generated:', response.data.linkUrl);
        setLinkUrl(response.data.linkUrl);
        onLinkGenerated?.(response.data.linkUrl);
      } catch (err: any) {
        const errorMsg = err?.response?.data?.error || err?.message || 'Failed to generate video link';
        console.error('❌ Error generating link:', errorMsg);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    generateLink();
  }, [sessionId, isMentor, onLinkGenerated]);

  const handleCopyLink = async () => {
    if (!linkUrl) return;

    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('❌ Failed to copy link:', err);
    }
  };

  const handleShareViaChat = async () => {
    if (!linkUrl) return;

    // Just copy the link for now - user will paste in chat
    await handleCopyLink();
    alert('Link copied! You can now share it via chat.');
  };

  if (!isMentor) {
    return (
      <GlowingCard glow="purple" className="p-6 text-center">
        <div className="space-y-4">
          <p className="text-gray-300">
            ⏳ Waiting for mentor to generate video conference link...
          </p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        </div>
      </GlowingCard>
    );
  }

  return (
    <GlowingCard glow="green" className="p-6 space-y-4">
      <h3 className="text-xl font-bold text-white">🔗 Video Conference Ready</h3>

      {loading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded p-4">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}

      {linkUrl && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            Share this link with the student to start video conference:
          </p>

          {/* Link Display */}
          <div className="bg-dark-800 border border-gray-700/50 rounded p-3 flex items-center justify-between gap-2">
            <p className="text-cyan-400 text-xs md:text-sm flex-1 truncate font-mono">{linkUrl}</p>
            <GlowingButton
              variant="secondary"
              className="text-xs py-2 px-3 flex-shrink-0"
              onClick={handleCopyLink}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </GlowingButton>
          </div>

          {/* Share Options */}
          <div className="grid grid-cols-2 gap-2">
            <GlowingButton
              variant="primary"
              className="text-sm py-2"
              onClick={handleShareViaChat}
            >
              💬 Share via Chat
            </GlowingButton>
            <GlowingButton
              variant="secondary"
              className="text-sm py-2"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'Video Conference',
                    text: 'Join my video conference',
                    url: linkUrl,
                  });
                } else {
                  alert('Share is not supported on this browser');
                }
              }}
            >
              🔗 Share
            </GlowingButton>
          </div>

          <p className="text-gray-400 text-xs">
            ✅ Link expires in 24 hours. Student will enter video conference automatically when clicking the link.
          </p>
        </div>
      )}
    </GlowingCard>
  );
}
