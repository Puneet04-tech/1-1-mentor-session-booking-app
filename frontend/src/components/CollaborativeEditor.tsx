'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { createNewCollaborativeEditorService } from '@/services/collaborativeEditorService';
import type { IStandaloneCodeEditor } from 'monaco-editor';
import type { WebsocketProvider } from 'y-websocket';

// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.Editor),
  { ssr: false }
);

interface CollaborativeEditorProps {
  sessionId: string;
  userId: string;
  initialCode?: string;
  language?: string;
  theme?: string;
  readOnly?: boolean;
  onCodeChange?: (code: string) => void;
  className?: string;
  height?: string | number;
  wsUrl?: string;
}

interface RemoteUserCursor {
  userId: string;
  line: number;
  column: number;
  color: string;
  name: string;
}

/**
 * CollaborativeEditor Component
 * Real-time code editing with CRDT using Yjs
 * Supports multiple users editing simultaneously with automatic conflict resolution
 */
export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  sessionId,
  userId,
  initialCode = '// Start collaborating...',
  language = 'javascript',
  theme = 'vs-dark',
  readOnly = false,
  onCodeChange,
  className = '',
  height = '100%',
  wsUrl,
}) => {
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const collaborativeEditorRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [remoteUsers, setRemoteUsers] = useState<RemoteUserCursor[]>([]);
  const [localCode, setLocalCode] = useState(initialCode);

  // Initialize collaborative editor service
  useEffect(() => {
    const initializeCollaborativeEditor = async () => {
      try {
        console.log('🎯 [EDITOR] Initializing collaborative editor:', { sessionId, userId });

        const collaborativeEditor = createNewCollaborativeEditorService();
        await collaborativeEditor.initialize(sessionId, userId, wsUrl);

        collaborativeEditorRef.current = collaborativeEditor;

        // Subscribe to sync status
        const provider = collaborativeEditor.getProvider();
        if (provider) {
          setConnectionStatus('connected');
          setIsConnected(true);
          console.log('✅ [EDITOR] Connected to collaborative session');

          // Subscribe to remote awareness changes (other users)
          const unsubscribe = collaborativeEditor.observeRemoteAwareness((remoteUsersList) => {
            console.log('👥 [EDITOR] Remote users updated:', remoteUsersList);
            setRemoteUsers(
              remoteUsersList.map((state: any) => ({
                userId: state.user?.id || 'unknown',
                line: state.user?.line || 0,
                column: state.user?.column || 0,
                color: state.user?.color || '#888888',
                name: state.user?.name || 'Guest',
              }))
            );
          });

          return () => {
            unsubscribe?.();
          };
        }
      } catch (error) {
        console.error('❌ [EDITOR] Failed to initialize:', error);
        setConnectionStatus('error');
        setIsConnected(false);
      }
    };

    initializeCollaborativeEditor();

    return () => {
      // Cleanup will happen in editor unmount
    };
  }, [sessionId, userId, wsUrl]);

  // Setup Monaco binding with Yjs
  const handleEditorDidMount = useCallback(
    (editor: IStandaloneCodeEditor, monaco: any) => {
      console.log('🎨 [EDITOR] Monaco editor mounted');

      editorRef.current = editor;
      monacoRef.current = monaco;

      if (!collaborativeEditorRef.current) {
        console.warn('⚠️ [EDITOR] Collaborative service not ready yet, retrying...');
        setTimeout(() => handleEditorDidMount(editor, monaco), 500);
        return;
      }

      try {
        const yText = collaborativeEditorRef.current.getSharedText();
        const provider = collaborativeEditorRef.current.getProvider();
        const awareness = provider?.awareness;

        if (!yText || !awareness) {
          console.error('❌ [EDITOR] Missing yText or awareness');
          return;
        }

        console.log('🔗 [EDITOR] Setting up MonacoBinding...');

        // Create MonacoBinding - connects Monaco ↔ Yjs
        const binding = new MonacoBinding(
          yText,
          editor.getModel()!,
          new Set([editor]),
          awareness
        );

        bindingRef.current = binding;

        // Set initial code if Yjs is empty
        if (yText.length === 0 && initialCode) {
          console.log('📝 [EDITOR] Setting initial code');
          yText.insert(0, initialCode);
        }

        // Observe code changes for local callback
        let isLocalChange = false;
        editor.onDidChangeModelContent(() => {
          isLocalChange = true;
        });

        yText.observe((event) => {
          if (!isLocalChange) {
            const currentCode = yText.toString();
            setLocalCode(currentCode);
            onCodeChange?.(currentCode);
            console.log('📝 [EDITOR] Code changed by remote user, length:', currentCode.length);
          }
          isLocalChange = false;
        });

        console.log('✅ [EDITOR] MonacoBinding established successfully');

        // Set initial local state
        const currentCode = yText.toString();
        setLocalCode(currentCode);
        onCodeChange?.(currentCode);
      } catch (error) {
        console.error('❌ [EDITOR] Error setting up binding:', error);
      }
    },
    [initialCode, onCodeChange]
  );

  // Track cursor position for presence
  const handleEditorSelection = useCallback((e: any) => {
    if (!collaborativeEditorRef.current) return;

    const position = editorRef.current?.getPosition();
    if (position) {
      console.log('👆 [EDITOR] Cursor moved:', { line: position.lineNumber, column: position.column });
      collaborativeEditorRef.current.setUserPresence({
        line: position.lineNumber,
        column: position.column,
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 [EDITOR] Cleaning up collaborative editor');
      if (bindingRef.current) {
        try {
          bindingRef.current.destroy();
        } catch (error) {
          console.error('Error destroying binding:', error);
        }
      }
      if (collaborativeEditorRef.current) {
        collaborativeEditorRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Connection Status Indicator */}
      <div className={`absolute top-2 right-2 z-50 px-3 py-1 rounded text-sm font-medium flex items-center gap-2 ${
        isConnected
          ? 'bg-green-500/10 text-green-400'
          : 'bg-red-500/10 text-red-400'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        {connectionStatus === 'connecting' && 'Connecting...'}
        {connectionStatus === 'connected' && 'Synced'}
        {connectionStatus === 'error' && 'Sync Error'}
      </div>

      {/* Remote Users Indicator */}
      {remoteUsers.length > 0 && (
        <div className="absolute top-2 left-2 z-50 flex items-center gap-2 bg-black/50 px-3 py-1 rounded text-sm">
          <span className="text-gray-400">Collaborators:</span>
          <div className="flex gap-1">
            {remoteUsers.map((user) => (
              <div
                key={user.userId}
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: user.color }}
                title={`${user.name} - Line ${user.line}, Col ${user.column}`}
              >
                {user.name.charAt(0)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <Editor
        height={height}
        defaultLanguage={language}
        theme={theme}
        value={localCode}
        onMount={handleEditorDidMount}
        onSelectionChange={handleEditorSelection}
        options={{
          // Editor options
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          folding: true,
          automaticLayout: true,
          formatOnPaste: false,
          formatOnType: false,
          wordWrap: 'on',
          readOnly: readOnly,

          // Collaborative features
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },

          // Better for real-time editing
          smoothScrolling: true,
          mouseWheelZoom: true,
        }}
      />

      {/* Loading Indicator */}
      {connectionStatus === 'connecting' && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded pointer-events-none">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-gray-300 text-sm">Connecting to collaborative session...</p>
          </div>
        </div>
      )}

      {/* Error Indicator */}
      {connectionStatus === 'error' && (
        <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center rounded pointer-events-none">
          <div className="text-center">
            <p className="text-red-400 text-sm">⚠️ Connection error. Trying to reconnect...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaborativeEditor;
