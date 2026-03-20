'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { apiClient } from '@/services/api';
import { socketService } from '@/services/socket';
import { Session, Message } from '@/types';
import {
  GlowingButton,
  GlowingCard,
  Avatar,
  Badge,
  LoadingSpinner,
} from '@/components/ui/GlowingComponents';
import { useSessionStore, useEditorStore, useVideoStore } from '@/store';

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

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const messageEndRef = useRef<HTMLDivElement>(null);
  const listenerRef = useRef<{ cleanup: () => void } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const {
    messages,
    setCurrentSession,
    addMessage,
    setMessages,
  } = useSessionStore();

  const { code, language, setCode, setLanguage, executionOutput } = useEditorStore();
  const { isCameraOn, isMicOn } = useVideoStore();

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      try {
        const res = await apiClient.getSession(sessionId);
        if (res.data) {
          setSession(res.data);
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
    if (!socketService.isConnected()) return;

    socketService.joinSession(sessionId);

    // Handler for code updates from other user
    const handleCodeUpdate = (data: any) => {
      // Update code from other user
      if (data.code && data.language) {
        setCode(data.code);
        setLanguage(data.language);
        console.log('Code updated from other user:', data);
      }
    };

    // Handler for incoming messages - with deduplication
    const handleMessageReceive = (message: any) => {
      // Prevent duplicate messages by checking if message ID already exists
      const existingMessages = useSessionStore.getState().messages;
      if (!existingMessages.find((m) => m.id === message.id)) {
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

    // Register listeners
    socketService.on('code:update', handleCodeUpdate);
    socketService.on('message:receive', handleMessageReceive);
    socketService.on('code:execution:result', handleExecutionResult);

    // Store cleanup function
    listenerRef.current = {
      cleanup: () => {
        socketService.off('code:update', handleCodeUpdate);
        socketService.off('message:receive', handleMessageReceive);
        socketService.off('code:execution:result', handleExecutionResult);
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
    if (videoRef.current && localStreamRef.current) {
      if (isCameraOn) {
        videoRef.current.srcObject = localStreamRef.current;
      } else {
        videoRef.current.srcObject = null;
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
    if (!socketService.isConnected()) {
      console.error('Socket not connected');
      return;
    }
    socketService.sendMessage(content);
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    
    // Always update local state, regardless of socket connection
    setCode(value);
    
    // Try to send through socket if connected
    if (socketService.isConnected()) {
      socketService.sendCode(value, language, sessionId);
      console.log('Code change sent:', { code: value, language, sessionId });
    } else {
      console.warn('Socket not connected - code saved locally only');
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
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
      videoRef.current ? videoRef.current.srcObject = null : null;
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
        <LoadingSpinner />
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

      {/* Main Content - Flex layout to manage space */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4 p-2 md:p-3 lg:p-4 overflow-y-auto lg:overflow-hidden">
        {/* Code Editor - Full height on mobile, 2/3 on large screens */}
        <div className="lg:col-span-2 flex flex-col bg-dark-900/40 rounded-lg border border-gray-700/30 overflow-hidden h-[50vh] lg:h-auto lg:flex-none lg:min-h-0">
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
              onMount={(editor, monaco) => {
                editor?.layout();
                console.log('Editor mounted');
              }}
            />
          </div>
        </div>

        {/* Right Panel - Video + Chat - Visible on all screens */}
        <div className="flex flex-col gap-2 md:gap-3 lg:gap-4 lg:min-h-0 lg:overflow-hidden lg:col-span-1">
          {/* Video Panel */}
          <GlowingCard glow="purple" className="flex-shrink-0 h-32 md:h-40 lg:h-56 flex flex-col">
            <h3 className="font-bold text-white text-xs md:text-base mb-1 md:mb-3 px-2 md:px-4 pt-2 md:pt-4 flex-shrink-0">Video Call</h3>
            <div className="flex-1 min-h-0 bg-black rounded flex flex-col items-center justify-center overflow-hidden relative">
              {isCameraOn && localStreamRef.current ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center flex flex-col items-center justify-center h-full">
                  <p className="text-gray-400 text-xs md:text-sm mb-2 md:mb-4">📹 Camera is OFF</p>
                  {cameraError && <p className="text-red-400 text-xs mb-2">{cameraError}</p>}
                  <p className="text-gray-500 text-xs mb-2 md:mb-4">
                    {isMicOn ? '🎤 ON' : '🔇 OFF'}
                  </p>
                </div>
              )}
              <div className="w-full px-2 md:px-4 py-1 md:py-3 border-t border-gray-700/30 gap-1 md:gap-2 flex flex-shrink-0 bg-dark-950/80">
                <GlowingButton 
                  variant="secondary" 
                  className="text-xs flex-1 py-1 md:py-2"
                  onClick={handleToggleCamera}
                >
                  {isCameraOn ? '✓' : '✗'} Cam
                </GlowingButton>
                <GlowingButton 
                  variant="secondary" 
                  className="text-xs flex-1 py-1 md:py-2"
                  onClick={handleToggleMic}
                >
                  {isMicOn ? '✓' : '✗'} 🎤
                </GlowingButton>
              </div>
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
