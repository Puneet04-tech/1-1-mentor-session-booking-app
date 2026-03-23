'use client';

import { useEffect, useRef, useState } from 'react';
import { webrtcService } from '@/services/webrtc';
import { apiClient } from '@/services/api';
import { GlowingButton } from '@/components/ui/GlowingComponents';

interface VideoConferencingProps {
  sessionId: string;
  userId: string;
  userName: string;
  onClose?: () => void;
}

export function VideoConferencing({ sessionId, userId, userName, onClose }: VideoConferencingProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);

  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string | null>(null);
  const [waitingTimeout, setWaitingTimeout] = useState(false);

  // Initialize video on mount
  useEffect(() => {
    const initializeVideo = async () => {
      try {
        console.log('🎬 VideoConferencing component mounted');
        console.log('📊 Session ID:', sessionId);
        console.log('📊 User ID:', userId);
        console.log('📊 User Name:', userName);
        
        setLoading(true);
        setError(null);

        // Start local video
        console.log('📹 Calling startLocalVideo...');
        const localStream = await webrtcService.startLocalVideo(sessionId, userId);
        console.log('✅ Got local stream');

        // Fetch session to find remote user ID
        console.log('📋 Fetching session data...');
        const response = await apiClient.getSession(sessionId);
        const session = response?.data;
        
        if (!session) {
          throw new Error('Failed to fetch session data');
        }
        console.log('✅ Got session data:', {
          mentorId: session.mentor_id,
          studentId: session.student_id,
          currentUserId: userId
        });
        
        // Find remote user ID (mentor or student, whichever is not the current user)
        const remoteUserId = session.mentor_id === userId ? session.student_id : session.mentor_id;
        
        if (!remoteUserId) {
          throw new Error('Could not find remote participant');
        }
        console.log('✅ Found remote user:', remoteUserId);

        // Set callbacks
        webrtcService.setOnLocalStream((stream) => {
          console.log('💾 Local stream ready, setting to video element');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        });

        webrtcService.setOnRemoteStream((stream, peerId) => {
          console.log('💾 Remote stream ready, setting to video element');
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            setRemoteUserName('Remote User');
            setWaitingTimeout(false);
          }
        });

        webrtcService.setOnScreenShare((stream, peerId) => {
          console.log('🖥️ Screen share stream ready, setting to screen element');
          if (screenShareRef.current) {
            screenShareRef.current.srcObject = stream;
          }
        });

        webrtcService.setOnStreamEnded((peerId) => {
          console.log('🏁 Stream ended');
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
            setRemoteUserName(null);
          }
        });

        // Set up initial video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        // Initiate connection (only one side will actually send offer based on user ID comparison)
        console.log('🔗 Calling initiateConnection...');
        await webrtcService.initiateConnection(remoteUserId);

        // Set timeout for waiting for remote participant
        const timeoutId = setTimeout(() => {
          if (!remoteVideoRef.current?.srcObject) {
            setWaitingTimeout(true);
            console.warn('⚠️ Waiting timeout - remote participant has not connected after 15 seconds');
          }
        }, 15000);

        setLoading(false);
        console.log('✅ Video conference initialized successfully');
        
        return timeoutId;
      } catch (err: any) {
        console.error('❌ Error initializing video:', err);
        setError(err.message || 'Failed to initialize video');
        setLoading(false);
      }
    };

    let timeoutId: NodeJS.Timeout | null = null;
    
    initializeVideo().then((id) => {
      timeoutId = id || null;
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      webrtcService.closeAllConnections();
    };
  }, [sessionId, userId]);

  const toggleVideo = () => {
    const stream = webrtcService.getLocalStream();
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    const stream = webrtcService.getLocalStream();
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const handleScreenShare = async () => {
    // Disable screen share in VideoConferencing component
    // Screen share is now handled by the main session page
    console.log('🚫 Screen share disabled in VideoConferencing component');
    return;
  };

  const handleEndCall = () => {
    webrtcService.closeAllConnections();
    if (onClose) {
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/80 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-white">Initializing video conference...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/80 rounded-lg">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <GlowingButton variant="secondary" onClick={handleEndCall}>
            Close
          </GlowingButton>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden flex flex-col">
      {/* Main Video Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Local Video (Small Picture-in-Picture) */}
        <div className="absolute bottom-4 right-4 w-32 h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-cyan-500/50 z-10">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-2 py-1 rounded">
            You
          </div>
        </div>

        {/* Remote Video (Main) */}
        {remoteVideoRef.current?.srcObject ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 mx-auto mb-4 flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {remoteUserName?.[0] || '?'}
                </span>
              </div>
              <p className="text-gray-400 mb-2">
                {remoteUserName ? `${remoteUserName} is in call...` : 'Waiting for other participant...'}
              </p>
              {waitingTimeout && (
                <p className="text-yellow-400 text-sm">
                  ⚠️ Still waiting... Check if participant has joined the session
                </p>
              )}
            </div>
          </div>
        )}

        {/* Screen Share Overlay */}
        {isScreenSharing && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2">
              <span className="animate-pulse">●</span> Sharing Screen
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-dark-950/95 border-t border-gray-700/50 px-4 py-4 flex items-center justify-center gap-3">
        {/* Microphone Toggle */}
        <GlowingButton
          variant="secondary"
          className={`text-sm px-4 py-2 flex items-center gap-2 ${!isAudioEnabled ? 'opacity-50' : ''}`}
          onClick={toggleAudio}
        >
          {isAudioEnabled ? '🎤' : '🔇'} Mic
        </GlowingButton>

        {/* Camera Toggle */}
        <GlowingButton
          variant="secondary"
          className={`text-sm px-4 py-2 flex items-center gap-2 ${!isVideoEnabled ? 'opacity-50' : ''}`}
          onClick={toggleVideo}
        >
          {isVideoEnabled ? '📷' : '📹'} Camera
        </GlowingButton>

        {/* Screen Share Toggle - DISABLED */}
        {/* Screen share is now handled by the main session page */}
        {/* 
        <GlowingButton
          variant="secondary"
          className={`text-sm px-4 py-2 flex items-center gap-2 ${isScreenSharing ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={handleScreenShare}
        >
          {isScreenSharing ? '✓' : ''} 🖥️ Share
        </GlowingButton>
        */}

        {/* End Call */}
        <GlowingButton
          variant="outline"
          className="text-sm px-6 py-2"
          onClick={handleEndCall}
        >
          📞 End Call
        </GlowingButton>
      </div>

      {/* Connection Stats */}
      <div className="bg-dark-900/50 text-xs text-gray-400 px-4 py-2 text-center border-t border-gray-700/30">
        Video Conferencing • Screen Sharing Enabled
      </div>
    </div>
  );
}
