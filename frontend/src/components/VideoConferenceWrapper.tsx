'use client';

import { useState, useEffect, useRef } from 'react';
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
  const initializeRef = useRef(false); // Prevent multiple initializations

  useEffect(() => {
    // Only initialize once per session
    if (initializeRef.current) return;
    if (!user?.id) return; // Wait for user to be ready
    
    initializeRef.current = true;

    const initialize = async () => {
      try {
        // Fetch session to determine if user is student or mentor
        const response = await apiClient.getSession(sessionId);
        const session = response?.data;

        if (!session) {
          throw new Error('Session not found');
        }

        console.log('📋 Session data:', { 
          mentorId: session.mentor_id, 
          studentId: session.student_id, 
          userId: user?.id,
          isStudent: session.student_id === user?.id 
        });

        // Determine if current user is student
        const isUserStudent = session.student_id === user?.id;
        setIsStudent(isUserStudent);

        // If student, generate code
        if (isUserStudent) {
          console.log('🎓 User is student, generating code...');
          const codeResponse = await apiClient.generateVideoCode(sessionId);
          console.log('💾 Code response:', codeResponse);
          
          if (codeResponse?.data?.code) {
            console.log('✅ Code received:', codeResponse.data.code);
            setVideoCode(codeResponse.data.code);
          } else {
            console.warn('⚠️ No code in response:', { codeResponse, data: codeResponse?.data });
          }
        } else {
          console.log('👨‍🏫 User is mentor, waiting for code input');
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ Error initializing video conference:', err);
        setLoading(false);
      }
    };

    initialize();
  }, [sessionId]); // Only depend on sessionId, not user?.id (user is checked inside)

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
