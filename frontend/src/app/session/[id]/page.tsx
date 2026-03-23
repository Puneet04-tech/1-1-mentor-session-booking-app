'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { webrtcService } from '@/services/webrtc';
import { apiClient } from '@/services/api';
import { socketService } from '@/services/socket';
import { useSessionStore, useEditorStore, useVideoStore, useAuthStore } from '@/store';
import { GlowingButton, GlowingCard, Badge, Avatar } from '@/components/ui/GlowingComponents';
import dynamic from 'next/dynamic';

// Configure Monaco Editor - disable workers to avoid network errors
if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorkerUrl: () => {
      // Return a simple worker that doesn't require network access
      const blob = new Blob(['self.onmessage = () => {}'], { type: 'application/javascript' });
      return URL.createObjectURL(blob);
    }
  };
}

// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.Editor),
  { 
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center bg-black">Loading editor...</div>
  }
);

interface Session {
  id: string;
  title: string;
  description: string;
  status: string;
  mentor_id: string;
  student_id: string;
}

interface Message {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: {
    name: string;
    email: string;
  };
}

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const messageEndRef = useRef<HTMLDivElement>(null);
  const listenerRef = useRef<any>(null);

  const {
    messages,
    setCurrentSession,
    addMessage,
    setMessages,
  } = useSessionStore();

  const { code, language, setCode, setLanguage, executionOutput } = useEditorStore();
  const { isCameraOn, isMicOn } = useVideoStore(); // Remove screen share from global store
  const currentUser = useAuthStore((state) => state.user);

  // Ref for video elements
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Video states
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string | null>(null);

  // Initialize video conferencing on mount
  useEffect(() => {
    const initializeVideo = async () => {
      try {
        console.log('🎬 Initializing video in session page...');
        setVideoLoading(true);
        setVideoError(null);

        // Start local video
        console.log('📹 Starting local video...');
        const localStream = await webrtcService.startLocalVideo(sessionId, currentUser?.id || '');
        console.log('✅ Local video started');

        // Fetch session to find remote user
        const response = await apiClient.getSession(sessionId);
        const session = response?.data;
        
        if (!session) {
          throw new Error('Failed to fetch session data');
        }

        // Find remote user ID
        const remoteUserId = session.mentor_id === currentUser?.id ? session.student_id : session.mentor_id;
        
        if (!remoteUserId) {
          throw new Error('Could not find remote participant');
        }
        console.log('✅ Found remote user:', remoteUserId);

        // Set WebRTC callbacks
        webrtcService.setUserRole(currentUser?.role === 'admin' ? 'student' : currentUser?.role || 'student');
        webrtcService.setOnLocalStream((stream: MediaStream) => {
          console.log('💾 Setting local stream to video element');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        });

        webrtcService.setOnRemoteStream((stream: MediaStream, peerId: string) => {
          console.log('💾 Setting remote stream to video element');
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            setRemoteUserName('Remote User');
          }
        });

        webrtcService.setOnScreenShare((stream: MediaStream, peerId: string) => {
          console.log('🖥️ Received remote screen share stream:', stream);
          // Set screen share stream to screen share video element
          if (screenShareRef.current) {
            screenShareRef.current.srcObject = stream;
            console.log('✅ Remote screen share stream set to video element');
          }
          setIsScreenSharingActive(true);
        });

        webrtcService.setOnStreamEnded((peerId: string) => {
          console.log('🏁 Stream ended');
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
            setRemoteUserName(null);
          }
        });

        // Set initial local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        // Initiate WebRTC connection - only mentor should initiate
        console.log('🔗 Checking if should initiate WebRTC connection...');
        console.log('👤 Current user role:', currentUser?.role);
        console.log('👤 Current user ID:', currentUser?.id);
        console.log('👤 Remote user ID:', remoteUserId);
        
        if (currentUser?.role === 'mentor') {
          console.log('🎓 Mentor detected - initiating WebRTC connection...');
          await webrtcService.initiateConnection(remoteUserId);
        } else {
          console.log('👨‍🎓 Student detected - waiting for mentor to initiate connection...');
          
          // Wait a moment for mentor's connection, then check if we need to request connection
          setTimeout(async () => {
            console.log('🔍 Checking if connection exists after delay...');
            
            // Check if we have any peer connections
            const hasConnection = webrtcService.hasPeerConnection(remoteUserId);
            console.log('🔗 Has peer connection:', hasConnection);
            
            if (!hasConnection) {
              console.log('🔄 No connection found, requesting connection from mentor...');
              // Student can send a signal to mentor to initiate connection
              socketService.emit('video:connection-request', {
                sessionId,
                userId: currentUser?.id,
                targetUserId: remoteUserId
              } as any);
            }
          }, 2000); // Wait 2 seconds for mentor's connection
        }

        setVideoLoading(false);
        console.log('✅ Video initialized in session page');
      } catch (err: any) {
        console.error('❌ Error initializing video:', err);
        setVideoError(err.message || 'Failed to initialize video');
        setVideoLoading(false);
      }
    };

    if (currentUser && sessionId) {
      initializeVideo();
    }
  }, [currentUser, sessionId]);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getSession(sessionId);
        if (res.data) {
          setSession(res.data as Session);
          setCurrentSession(res.data);
        }

        const messagesRes = await apiClient.getMessages(sessionId);
        if (messagesRes.data) {
          setMessages(messagesRes.data);
        }

        const codeRes = await apiClient.getCodeSnapshot(sessionId);
        if (codeRes.data) {
          setCode(codeRes.data.code);
          setLanguage(codeRes.data.language);
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  // Setup socket events
  useEffect(() => {
    // Handler for code updates from other user
    const handleCodeUpdate = (data: any) => {
      console.log('📝 Code update received in frontend:', data);
      
      // Update code from other user
      if (data.code && data.language) {
        setCode(data.code);
        setLanguage(data.language);
        console.log('✅ Code updated from other user:', { 
          codeLength: data.code.length, 
          language: data.language,
          userId: data.userId 
        });
      }
    };

    // Handler for incoming messages - with deduplication
    const handleMessageReceive = (message: any) => {
      console.log('📨 Message received in frontend:', message);
      
      // Prevent duplicate messages by checking if message ID already exists
      // If it's a server message (not temp), check if we already have a temp version
      const existingMessages = useSessionStore.getState().messages;
      
      // Check if exact message already exists
      const exactMatch = existingMessages.find((m) => m.id === message.id);
      if (exactMatch) {
        console.log('⚠️ Duplicate message ignored:', message.id);
        return; // Already have this exact message
      }
      
      // Check if we have a temp message from same user with same content
      const tempMatch = existingMessages.find((m) =>
        m.id.startsWith('temp-') &&
        m.user_id === message.user_id &&
        m.content === message.content
      );
      
      if (tempMatch) {
        console.log('🔄 Replacing temp message with server message');
        // Replace temp message with real server message
        const updatedMessages = existingMessages.map(m =>
          m.id === tempMatch.id ? message : m
        );
        setMessages(updatedMessages);
      } else {
        console.log('➕ Adding new message');
        // Add new message
        addMessage(message);
      }
    };

    // Handler for code execution results from mentor or other users
    const handleExecutionResult = (result: any) => {
      const { setExecutionOutput } = useEditorStore.getState();
      console.log('Code execution result received:', result);
      
      if (result.status === 'Success') {
        setExecutionOutput(result.output || 'Code executed successfully (no output)');
      } else {
        setExecutionOutput(`${result.status}:\n${result.output || result.error || 'Unknown error'}`);
      }
    };

    // Handler for screen share started from remote user
    const handleScreenShareStarted = (data: any) => {
      console.log('🖥️ Remote screen share started:', data);
      
      // Only show screen share if it's from another user (not our own)
      if (data.userId !== currentUser?.id && data.sessionId === sessionId) {
        console.log('📺 Showing remote screen share from user:', data.userId);
        
        // The screen share will be received via WebRTC remote stream
        // We just need to show the screen share overlay
        // The actual video content will come through the remote video stream
        if (screenShareRef.current) {
          // Clear any existing content
          screenShareRef.current.style.background = '';
          screenShareRef.current.style.display = '';
          screenShareRef.current.innerHTML = '';
        }
        
        setIsScreenSharingActive(true);
        console.log('✅ Remote screen share overlay activated');
      }
    };

    // Handler for screen share stopped from remote user
    const handleScreenShareStopped = (data: any) => {
      console.log('🛑 Remote screen share stopped:', data);
      
      // Only clear if this is not our own screen share and matches current session
      if (data.userId !== currentUser?.id && data.sessionId === sessionId) {
        if (screenShareRef.current) {
          screenShareRef.current.style.background = '';
          screenShareRef.current.style.display = '';
          screenShareRef.current.innerHTML = '';
        }
        setIsScreenSharingActive(false);
      }
    };

    // Register listeners FIRST before joining session
    socketService.on('code:update', handleCodeUpdate);
    socketService.on('message:receive', handleMessageReceive);
    socketService.on('code:execution:result', handleExecutionResult);
    socketService.on('screen:started', handleScreenShareStarted);
    socketService.on('screen:stopped', handleScreenShareStopped);

    // Wait for socket to connect, then join session
    const joinWithRetry = async () => {
      let attempts = 0;
      while (attempts < 10) {
        if (socketService.isConnected()) {
          console.log('✅ Socket connected, joining session:', sessionId);
          console.log('📊 Current user:', currentUser);
          socketService.joinSession(sessionId);
          break;
        }
        attempts++;
        console.log(`⏳ Attempt ${attempts}/10: Socket not connected, waiting 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (attempts >= 10) {
        console.warn('❌ Socket connection timeout - could not join session');
      }
    };

    joinWithRetry();

    // Store cleanup function
    listenerRef.current = {
      cleanup: () => {
        socketService.off('code:update', handleCodeUpdate);
        socketService.off('message:receive', handleMessageReceive);
        socketService.off('code:execution:result', handleExecutionResult);
        socketService.off('screen:started', handleScreenShareStarted);
        socketService.off('screen:stopped', handleScreenShareStopped);
      },
    };

    // Cleanup on unmount or sessionId change
    return () => {
      listenerRef.current?.cleanup();
      socketService.leaveSession(sessionId);
      // Stop all media streams on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [sessionId]);

  // Update video element when camera state changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      if (isCameraOn) {
        localVideoRef.current.srcObject = localStreamRef.current;
      } else {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [isCameraOn]);

  // Cleanup media streams on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    console.log('📤 Sending message:', content);
    
    if (!socketService.isConnected()) {
      console.error('❌ Socket not connected');
      return;
    }

    // Get current user
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
      console.error('❌ User not authenticated');
      return;
    }

    // Create message with temporary ID (will be replaced by server)
    const tempMessage: any = {
      id: `temp-${Date.now()}`,
      user_id: currentUser.id,
      content,
      type: 'text',
      created_at: new Date().toISOString(),
      user: {
        name: currentUser.name,
        email: currentUser.email,
      },
      avatar_url: currentUser.avatar_url,
      role: currentUser.role,
      verified: currentUser.verified,
      updated_at: currentUser.updated_at,
    };

    // Add message immediately to UI
    addMessage(tempMessage);

    // Send message to server (deduplication will handle server response)
    console.log('📡 Calling socketService.sendMessage');
    socketService.sendMessage(content);
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    
    // Always update local state, regardless of socket connection
    setCode(value);
    
    // Try to send through socket if connected
    if (socketService.isConnected()) {
      socketService.sendCode(value, language, sessionId);
      console.log('📤 Code change sent via socket:', { 
        codeLength: value?.length, 
        language, 
        sessionId,
        socketConnected: true 
      });
    } else {
      console.warn('⚠️ Socket not connected - code saved locally only');
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    if (socketService.isConnected()) {
      socketService.emit('language:change', { sessionId, language: newLanguage } as any);
    }
  };

  const handleToggleCamera = async () => {
    const videoStore = useVideoStore.getState();
    
    if (!videoStore.isCameraOn) {
      // Enable camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        videoStore.toggleCamera();
        videoStore.setLocalStream(stream);
        setCameraError('');
        if (socketService.isConnected()) {
          socketService.toggleCamera();
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Camera access denied';
        setCameraError(errorMsg);
        console.error('Camera error:', errorMsg);
      }
    } else {
      // Disable camera
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => track.stop());
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      videoStore.toggleCamera();
      videoStore.setLocalStream(null);
      setCameraError('');
      if (socketService.isConnected()) {
        socketService.toggleCamera();
      }
    }
  };

  const handleToggleMic = async () => {
    const videoStore = useVideoStore.getState();
    
    if (!videoStore.isMicOn) {
      // Enable mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true,
          video: false
        });
        // Store mic stream separately or merge with video stream
        localStreamRef.current?.addTrack(stream.getAudioTracks()[0]);
        videoStore.toggleMic();
        setCameraError('');
        if (socketService.isConnected()) {
          socketService.toggleMic();
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Mic access denied';
        setCameraError(errorMsg);
        console.error('Mic error:', errorMsg);
      }
    } else {
      // Disable mic
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => track.stop());
      }
      videoStore.toggleMic();
      setCameraError('');
      if (socketService.isConnected()) {
        socketService.toggleMic();
      }
    }
  };

  // Video control functions
  const handleToggleVideo = async () => {
    try {
      if (isVideoEnabled) {
        // Disable video
        if (localVideoRef.current?.srcObject) {
          const stream = localVideoRef.current.srcObject as MediaStream;
          stream.getVideoTracks().forEach(track => track.stop());
        }
        setIsVideoEnabled(false);
      } else {
        // Enable video
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: isAudioEnabled 
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setIsVideoEnabled(true);
      }
    } catch (err) {
      console.error('Error toggling video:', err);
    }
  };

  const handleToggleAudio = () => {
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const handleToggleScreenShare = async () => {
    console.log('🖥️ Toggle screen share, current state:', isScreenSharingActive);
    
    if (!isScreenSharingActive) {
      try {
        console.log('🎬 Requesting screen share permission...');
        
        // Request screen share with user gesture - this is crucial for browser permissions
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: false 
        });
        
        console.log('✅ Screen share stream obtained:', stream);
        console.log('📹 Stream tracks:', stream.getTracks().length);
        
        // Set to local screen share element immediately
        if (screenShareRef.current) {
          screenShareRef.current.srcObject = stream;
          console.log('✅ Stream set to screen share video element');
          
          // Ensure video plays inline (not in new tab)
          screenShareRef.current.setAttribute('playsinline', 'true');
          screenShareRef.current.setAttribute('webkit-playsinline', 'true');
          screenShareRef.current.muted = false; // Unmute for mentor to hear
          
          // Force video to play inline
          const playPromise = screenShareRef.current.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log('✅ Video play successful');
            }).catch((e: any) => {
              console.log('⚠️ Video play failed:', e);
              // Try to play with user interaction
              screenShareRef.current?.play().catch(err => {
                console.log('⚠️ Manual play failed:', err);
              });
            });
          }
        }
        
        // Set state to show overlay immediately
        setIsScreenSharingActive(true);
        console.log('✅ Screen share active state set');
        
        // Add screen share track to existing WebRTC peer connections
        // This will transmit the existing screen share stream to remote users
        if (webrtcService && stream) {
          console.log('🔄 Adding existing screen share stream to WebRTC connections');
          
          try {
            // Get the video track from our existing stream
            const videoTrack = stream.getVideoTracks()[0];
            console.log('📹 Screen share video track:', videoTrack);
            
            // Set the stream in WebRTC service first
            webrtcService.setScreenStream(stream);
            
            // Then start screen share to handle track replacement
            await webrtcService.startScreenShare(sessionId, currentUser?.id || '');
            
            console.log('✅ Screen share track added to WebRTC');
          } catch (error: any) {
        console.error('❌ Failed to add screen share track to WebRTC:', error);
        
        // Handle permission denied gracefully
        if (error.name === 'NotAllowedError') {
          alert('Screen sharing permission denied. Please allow screen sharing in your browser and try again.\n\nTo fix this:\n1. Click the Share Screen button again\n2. When prompted by browser, click "Allow" or "Share"\n3. Make sure you\'re not in incognito mode if that blocks screen sharing');
        } else if (error.name === 'AbortError' && error.message?.includes('Timeout')) {
          alert('Screen share timed out. Please try again and ensure your browser allows screen sharing.');
        } else if (error.name === 'AbortError') {
          alert('Screen share was cancelled or failed to start. Please try again.');
        } else {
          alert(`Screen share failed: ${error.message || 'Unknown error'}`);
        }
      }
        }
        
        // Notify other users via socket
        socketService.emit('screen:started', {
          sessionId,
          userId: currentUser?.id,
        } as any);
        
        console.log('📡 Screen share started event sent:', { sessionId, userId: currentUser?.id });
        
        // Handle stream end when user clicks "Stop sharing" in browser dialog
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            console.log('🛑 User stopped screen sharing via browser dialog');
            if (screenShareRef.current) {
              screenShareRef.current.srcObject = null;
            }
            setIsScreenSharingActive(false);
          };
          
          // Also listen for track mute/unmute
          videoTrack.onmute = () => {
            console.log('🔇 Screen share track muted');
          };
          
          videoTrack.onunmute = () => {
            console.log('🔊 Screen share track unmuted');
      }
      
      // Set state to show overlay immediately
      setIsScreenSharingActive(true);
      console.log('✅ Screen share active state set');
      // Clear screen share
      if (screenShareRef.current?.srcObject) {
        const stream = screenShareRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        screenShareRef.current.srcObject = null;
      }
      
      setIsScreenSharingActive(false);
      console.log('✅ Screen share stopped');
      
      // Stop WebRTC screen share
      if (webrtcService) {
        try {
          await webrtcService.stopScreenShare();
          console.log('✅ WebRTC screen share stopped successfully');
        } catch (error) {
          console.error('❌ WebRTC screen share stop failed:', error);
        }
      }
      
      // Notify other users
      socketService.emit('screen:stopped', {
        sessionId,
        userId: currentUser?.id,
      } as any);
      
      console.log('📡 Screen share stopped event sent:', { sessionId, userId: currentUser?.id });
    }
  };

  const handleEndSession = async () => {
    try {
      await apiClient.endSession(sessionId);
      socketService.endSession(sessionId);
      // Navigate back to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Error ending session:', err);
    }
  };

  const getJudge0LanguageId = (lang: string): { langId: number; requiresMain: boolean } => {
    const mapping: { [key: string]: { id: number; main: boolean } } = {
      javascript: { id: 63, main: false },
      python: { id: 71, main: false },
      java: { id: 62, main: true },
      cpp: { id: 54, main: false },
      typescript: { id: 63, main: false },
    };
    const result = mapping[lang] || mapping.javascript;
    return { langId: result.id, requiresMain: result.main };
  };

  const handleRunCode = async () => {
    if (!code.trim()) {
      alert('Please write some code first');
      return;
    }

    const { setExecutionOutput, setIsExecuting } = useEditorStore.getState();
    setIsExecuting(true);
    setExecutionOutput('Executing code...');

    try {
      // Call backend endpoint for code execution with sessionId
      const response = await apiClient.executeCode(code, language, sessionId);

      if (response?.data?.output) {
        setExecutionOutput(response.data.output);
      } else {
        setExecutionOutput('Code executed successfully (no output)');
      }

      console.log('Execution result:', response);
    } catch (err: any) {
      console.error('Error executing code:', err);
      const errorMsg = err?.response?.data?.message || 
                       err?.response?.data?.error ||
                       err?.message || 
                       'Failed to execute code. Make sure your backend is running.';
      setExecutionOutput(`Error: ${errorMsg}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const getFileExtension = (lang: string): string => {
    const extensions: { [key: string]: string } = {
      javascript: 'js',
      python: 'py',
      typescript: 'ts',
      java: 'java',
      cpp: 'cpp',
    };
    return extensions[lang] || 'txt';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-t-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-700/30 backdrop-blur-sm px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">{session?.title}</h1>
            <p className="text-gray-400 text-sm">{session?.description}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge color="purple">{session?.status}</Badge>
            <GlowingButton 
              variant="outline" 
              className="text-sm"
              onClick={handleEndSession}
            >
              End Session
            </GlowingButton>
          </div>
        </div>
      </header>

      {/* Main Content - Responsive layout */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4 p-2 md:p-3 lg:p-4 overflow-y-auto lg:overflow-hidden">
        {/* Code Editor - Takes full height on mobile, 2/3 on large screens */}
        <div className="lg:col-span-2 flex flex-col bg-dark-900/40 rounded-lg border border-gray-700/30 overflow-hidden min-h-[40vh] lg:min-h-0">
          <div className="px-2 md:px-4 py-2 md:py-3 border-b border-gray-700/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 flex-shrink-0">
            <h2 className="text-base md:text-lg font-bold text-white">Code Editor</h2>
            <div className="flex items-center gap-1 md:gap-2 w-full md:w-auto">
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="px-2 md:px-3 py-1 bg-dark-800 border border-gray-700/50 rounded text-xs md:text-sm text-white flex-1 md:flex-none"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="typescript">TypeScript</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
              </select>
              <GlowingButton 
                variant="secondary" 
                className="text-xs md:text-sm flex-1 md:flex-none"
                onClick={handleRunCode}
              >
                ▶ Run
              </GlowingButton>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                folding: false,
                automaticLayout: true,
                formatOnPaste: false,
                formatOnType: false,
                wordWrap: 'on',
              }}
              onMount={(editor: any, monaco: any) => {
                editor?.layout();
                console.log('Editor mounted');
              }}
            />
          </div>
        </div>

        {/* Right Panel - Video + Chat */}
        <div className="flex flex-col gap-2 md:gap-3 lg:gap-4 lg:min-h-0 lg:overflow-hidden lg:col-span-1">
          {/* Video Panel - Integrated in session page */}
          <GlowingCard glow="purple" className="flex-shrink-0 h-64 md:h-80 lg:h-96 flex flex-col">
            <h3 className="font-bold text-white text-xs md:text-base mb-1 md:mb-3 px-2 md:px-4 pt-2 md:pt-4 flex-shrink-0">Video Call</h3>
            <div className="flex-1 min-h-0 bg-black rounded flex flex-col overflow-hidden">
              {videoLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-2 border-white mx-auto mb-2"></div>
                    <p className="text-gray-400 text-xs md:text-sm">Connecting video...</p>
                  </div>
                </div>
              ) : videoError ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-400 text-xs md:text-sm mb-2">❌ {videoError}</p>
                    <GlowingButton 
                      variant="secondary" 
                      className="text-xs"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </GlowingButton>
                  </div>
                </div>
              ) : (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-2 p-2">
                  {/* Local Video */}
                  <div className="relative bg-gray-900 rounded overflow-hidden">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-white text-xs">
                      You
                    </div>
                  </div>
                  
                  {/* Remote Video */}
                  <div className="relative bg-gray-900 rounded overflow-hidden">
                    {remoteVideoRef.current?.srcObject ? (
                      <>
                        <video
                          ref={remoteVideoRef}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-white text-xs">
                          {remoteUserName || 'Remote User'}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="animate-pulse mb-2">👥</div>
                          <p className="text-gray-400 text-xs">Waiting for remote user...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Screen Share Overlay */}
              {(isScreenSharingActive || screenShareRef.current?.srcObject) && (
                <div className="absolute inset-0 bg-black z-10 flex items-center justify-center">
                  <video
                    ref={screenShareRef}
                    autoPlay
                    playsInline
                    muted={false}
                    controls={false}
                    className="w-full h-full object-contain"
                    style={{
                      WebkitUserSelect: 'none',
                      userSelect: 'none'
                    }}
                  />
                  <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2">
                    <span className="animate-pulse">●</span> Sharing Screen
                  </div>
                </div>
              )}
            </div>
            
            {/* Video Controls */}
            <div className="w-full px-2 md:px-4 py-2 md:py-3 border-t border-gray-700/30 gap-1 md:gap-2 flex flex-shrink-0 bg-dark-950/80">
              <GlowingButton 
                variant="secondary" 
                className="text-xs flex-1 py-1 md:py-2"
                onClick={handleToggleVideo}
              >
                {isVideoEnabled ? '📹' : '📹❌'} Video
              </GlowingButton>
              <GlowingButton 
                variant="secondary" 
                className="text-xs flex-1 py-1 md:py-2"
                onClick={handleToggleAudio}
              >
                {isAudioEnabled ? '🎤' : '🔇'} Audio
              </GlowingButton>
              <GlowingButton 
                variant="secondary" 
                className="text-xs flex-1 py-1 md:py-2"
                onClick={handleToggleScreenShare}
              >
                {isScreenSharingActive ? '🛑 Stop Share' : '🖥️ Share Screen'}
              </GlowingButton>
            </div>
          </GlowingCard>

          {/* Chat Panel */}
          <GlowingCard glow="green" className="flex-1 min-h-[120px] md:min-h-0 flex flex-col overflow-hidden">
            <h3 className="font-bold text-white text-xs md:text-base mb-1 md:mb-3 px-2 md:px-4 pt-2 md:pt-4 flex-shrink-0">Chat</h3>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 md:px-4 space-y-2 md:space-y-3 text-xs md:text-sm">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-2">
                  <Avatar name={msg.user?.name || 'User'} size="sm" />
                  <div>
                    <p className="font-semibold text-white text-xs">{msg.user?.name}</p>
                    <p className="text-gray-300 break-words text-xs md:text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>
            <div className="px-2 md:px-4 py-2 md:py-3 border-t border-gray-700/30 flex-shrink-0">
              <input
                type="text"
                placeholder="Send a message..."
                className="w-full px-3 py-2 bg-dark-800 border border-gray-700/50 rounded text-white text-sm placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/50"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                    handleSendMessage((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
          </GlowingCard>
        </div>
      </div>

      {/* Code Execution Output - Compact fixed size at bottom */}
      {executionOutput && (
        <div className="border-t border-gray-700/30 bg-dark-900/40 p-2 md:p-3 lg:p-4 max-h-[120px] md:max-h-[140px] lg:h-24 overflow-y-auto flex-shrink-0">
          <p className="text-sm font-semibold text-gray-400 mb-2">Output:</p>
          <pre className="text-xs md:text-sm text-green-400 font-mono whitespace-pre-wrap break-words">{executionOutput}</pre>
        </div>
      )}
    </div>
  );
}
