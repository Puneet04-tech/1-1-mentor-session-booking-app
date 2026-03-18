'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Editor } from '@monaco-editor/react';
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

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

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

    socketService.on('code:update', (data) => {
      if (data.user_id !== useSessionStore.getState().currentSession?.mentor_id) {
        setCode(data.code);
        setLanguage(data.language);
      }
    });

    socketService.on('message:receive', (message) => {
      addMessage(message);
    });

    return () => {
      socketService.leaveSession(sessionId);
    };
  }, [sessionId]);

  // Auto-scroll to latest message
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (content: string) => {
    socketService.sendMessage(content);
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    setCode(value);
    socketService.sendCode(value, language, '');
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    socketService.emit('language:change', { sessionId, language: newLanguage } as any);
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
      <header className="border-b border-gray-700/30 backdrop-blur-sm px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">{session?.title}</h1>
            <p className="text-gray-400 text-sm">{session?.description}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge color="purple">{session?.status}</Badge>
            <GlowingButton variant="outline" className="text-sm">
              End Session
            </GlowingButton>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">
        {/* Code Editor */}
        <div className="lg:col-span-2 flex flex-col bg-dark-900/40 rounded-lg border border-gray-700/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/30 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Code Editor</h2>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="px-3 py-1 bg-dark-800 border border-gray-700/50 rounded text-sm text-white"
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
            </select>
          </div>
          <div className="flex-1 overflow-hidden">
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
                folding: true,
              }}
            />
          </div>
        </div>

        {/* Right Panel - Video + Chat */}
        <div className="flex flex-col gap-4">
          {/* Video Panel */}
          <GlowingCard glow="purple" className="flex-1 flex flex-col">
            <h3 className="font-bold text-white mb-3 px-4 pt-4">Video Call</h3>
            <div className="flex-1 bg-dark-950 rounded flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-4">
                  {isCameraOn && isMicOn ? '🎥 Camera & Mic On' : '🔇 Camera & Mic Off'}
                </p>
                <div className="flex gap-2 justify-center">
                  <GlowingButton variant="secondary" className="text-sm">
                    {isCameraOn ? '📹' : '❌'} Camera
                  </GlowingButton>
                  <GlowingButton variant="secondary" className="text-sm">
                    {isMicOn ? '🎤' : '🔇'} Mic
                  </GlowingButton>
                </div>
              </div>
            </div>
          </GlowingCard>

          {/* Chat Panel */}
          <GlowingCard glow="green" className="flex-1 flex flex-col max-h-96">
            <h3 className="font-bold text-white mb-3 px-4 pt-4">Chat</h3>
            <div className="flex-1 overflow-y-auto px-4 space-y-3 text-sm">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-2">
                  <Avatar name={msg.user?.name || 'User'} size="sm" />
                  <div>
                    <p className="font-semibold text-white">{msg.user?.name}</p>
                    <p className="text-gray-300 break-words">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>
            <div className="px-4 py-3 border-t border-gray-700/30">
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

      {/* Code Execution Output */}
      {executionOutput && (
        <div className="border-t border-gray-700/30 bg-dark-900/40 p-4 max-h-32 overflow-y-auto">
          <p className="text-sm font-semibold text-gray-400 mb-2">Output:</p>
          <pre className="text-sm text-green-400 font-mono">{executionOutput}</pre>
        </div>
      )}
    </div>
  );
}
