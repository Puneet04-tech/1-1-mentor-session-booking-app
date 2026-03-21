'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { apiClient } from '@/services/api';
import { VideoConferencing } from './VideoConferencing';
import { VideoCodeModal } from './VideoCodeModal';

interface VideoConferenceWrapperProps {
  sessionId: string;
  onClose?: () => void;
}

export function VideoConferenceWrapper({ sessionId, onClose }: VideoConferenceWrapperProps) {
  const [showVideoCode, setShowVideoCode] = useState(true);
  const [videoCode, setVideoCode] = useState<string | null>(null);
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Fetch session to determine if user is student or mentor
        const response = await apiClient.getSession(sessionId);
        const session = response?.data;

        if (!session) {
          throw new Error('Session not found');
        }

        // Determine if current user is student
        const isUserStudent = session.student_id === user?.id;
        setIsStudent(isUserStudent);

        // If student, generate code
        if (isUserStudent) {
          const codeResponse = await apiClient.generateVideoCode(sessionId);
          if (codeResponse?.data?.code) {
            setVideoCode(codeResponse.data.code);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error initializing video conference:', err);
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

  if (showVideoCode) {
    return (
      <VideoCodeModal
        sessionId={sessionId}
        isStudent={isStudent}
        code={videoCode || undefined}
        onCodeVerified={() => setShowVideoCode(false)}
        onCancel={onClose || (() => {})}
      />
    );
  }

  return (
    <VideoConferencing
      sessionId={sessionId}
      userId={user?.id || ''}
      userName={user?.name || 'Participant'}
      onClose={onClose}
    />
  );
}
