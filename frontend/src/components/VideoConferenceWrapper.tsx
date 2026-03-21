'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store';
import { apiClient } from '@/services/api';
import { VideoConferencing } from './VideoConferencing';
import { VideoLinkModal } from './VideoLinkModal';

interface VideoConferenceWrapperProps {
  sessionId: string;
  onClose?: () => void;
  accessedViaLink?: boolean; // If true, skip link generation (accessed via shareable link)
}

export function VideoConferenceWrapper({ sessionId, onClose, accessedViaLink = false }: VideoConferenceWrapperProps) {
  const [showVideoLink, setShowVideoLink] = useState(!accessedViaLink);
  const [isConnected, setIsConnected] = useState(accessedViaLink);
  const [isMentor, setIsMentor] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((state) => state.user);
  const initializeRef = useRef(false);

  useEffect(() => {
    // Only initialize once per session
    if (initializeRef.current) return;
    if (!user?.id) return; // Wait for user to be ready
    
    initializeRef.current = true;

    const initialize = async () => {
      try {
        // Fetch session to determine role
        const response = await apiClient.getSession(sessionId);
        const session = response?.data;

        if (!session) {
          throw new Error('Session not found');
        }

        console.log('📋 Session data:', { 
          mentorId: session.mentor_id, 
          studentId: session.student_id, 
          userId: user?.id,
          isMentor: session.mentor_id === user?.id,
          accessedViaLink
        });

        // Determine if current user is mentor
        const isUserMentor = session.mentor_id === user?.id;
        setIsMentor(isUserMentor);

        setLoading(false);
      } catch (err) {
        console.error('❌ Error initializing video conference:', err);
        setLoading(false);
      }
    };

    initialize();
  }, [sessionId, user?.id]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/80 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-white">Initializing...</p>
        </div>
      </div>
    );
  }

  // Show link modal if not connected yet
  if (showVideoLink && !isConnected) {
    return (
      <VideoLinkModal
        sessionId={sessionId}
        isMentor={isMentor}
        onLinkGenerated={() => {
          console.log('📱 Link generated and displayed to mentor');
        }}
        onClose={onClose}
      />
    );
  }

  // Show video conferencing component once connected
  return (
    <VideoConferencing
      sessionId={sessionId}
      userId={user?.id || ''}
      userName={user?.name || 'Participant'}
      onClose={onClose}
    />
  );
}
