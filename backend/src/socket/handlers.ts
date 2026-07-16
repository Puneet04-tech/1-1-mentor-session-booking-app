import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  handleCodeUpdate,
  handleCursorMove,
  handleLanguageChange,
} from './handlers/codeEditor';
import {
  handleMessageSend,
  handleSessionJoin,
  handleSessionLeave,
} from './handlers/chat';
import {
  handleVideoInitiate,
  handleVideoOffer,
  handleVideoAnswer,
  handleICECandidate,
  handleVideoEnd,
  handleVideoConnectionRequest,
  handleScreenStarted,
  handleScreenStopped,
  handleScreenOffer,
  handleScreenAnswer,
  handleScreenICECandidate,
} from './handlers/video';
import {
  handlePresenceUpdate,
} from './handlers/presence';
import {
  handleRecordingRequest,
  handleRecordingConsent,
  handleRecordingStop,
} from './handlers/recording';
import {
  handleWhiteboardDraw,
  handleWhiteboardClear,
} from './handlers/whiteboard';
import {
  handleMentorProfileWatch,
  handleMentorProfileUnwatch,
} from './handlers/mentorAvailability';

function wrapSocketHandler<T>(
  socket: Socket,
  handler: (data: T) => void | Promise<void>
) {
  return async (data: T) => {
    try {
      await handler(data);
    } catch (error) {
      console.error('Socket handler error:', error);

      socket.emit('socket:error', {
        message: 'An unexpected error occurred.',
      });
    }
  };
}

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;

    console.log(`✅ User connected: ${socket.id} (userId: ${userId})`);
    console.log(`   Total connected clients: ${io.engine.clientsCount}`);

    // Code editor events
    socket.on(
      'code:update',
      wrapSocketHandler(socket, (data) =>
        handleCodeUpdate(socket, io, data)
      )
    );

    socket.on(
      'cursor:move',
      wrapSocketHandler(socket, (data) =>
        handleCursorMove(socket, io, data)
      )
    );

    socket.on(
      'language:change',
      wrapSocketHandler(socket, (data) =>
        handleLanguageChange(socket, io, data)
      )
    );

    // Whiteboard events
    socket.on(
      'whiteboard:draw',
      wrapSocketHandler(socket, (data) =>
        handleWhiteboardDraw(socket, io, data)
      )
    );

    socket.on(
      'whiteboard:clear',
      wrapSocketHandler(socket, (data) =>
        handleWhiteboardClear(socket, io, data)
      )
    );

    // Chat events
    socket.on(
      'message:send',
      wrapSocketHandler(socket, async (data) => {
        console.log('💬 ========== BACKEND: message:send event RECEIVED ==========');
        console.log('📊 Message data:', {
          sessionId: data?.sessionId,
          userId: data?.userId,
          contentLength: data?.content?.length,
          type: data?.type,
        });

        console.log('📊 Socket:', {
          socketId: socket.id,
          userId: socket.data.userId,
        });

        await handleMessageSend(socket, io, data);

        console.log('💬 ========== BACKEND: message:send PROCESSED ==========');
      })
    );

    socket.on(
      'session:join',
      wrapSocketHandler(socket, async (data) => {
        console.log('🚪 ========== BACKEND: session:join event RECEIVED ==========');
        console.log('📊 Event data:', data);
        console.log('📊 Socket details:', {
          socketId: socket.id,
          userId: socket.data.userId,
        });

        await handleSessionJoin(socket, io, data);

        console.log('🚪 ========== BACKEND: session:join PROCESSED ==========');
      })
    );

    socket.on(
      'session:leave',
      wrapSocketHandler(socket, (data) =>
        handleSessionLeave(socket, io, data)
      )
    );

    // Video events
    socket.on(
      'video:initiate',
      wrapSocketHandler(socket, (data) =>
        handleVideoInitiate(socket, io, data)
      )
    );

    socket.on(
      'video:offer',
      wrapSocketHandler(socket, (data) =>
        handleVideoOffer(socket, io, data)
      )
    );

    socket.on(
      'video:answer',
      wrapSocketHandler(socket, (data) =>
        handleVideoAnswer(socket, io, data)
      )
    );

    socket.on(
      'video:ice-candidate',
      wrapSocketHandler(socket, (data) =>
        handleICECandidate(socket, io, data)
      )
    );

    socket.on(
      'video:end',
      wrapSocketHandler(socket, async () => {
        await handleVideoEnd(socket, io);
      })
    );

    socket.on(
      'video:connection-request',
      wrapSocketHandler(socket, (data) =>
        handleVideoConnectionRequest(socket, io, data)
      )
    );

    // Screen share events
    socket.on(
      'screen:started',
      wrapSocketHandler(socket, (data) =>
        handleScreenStarted(socket, io, data)
      )
    );

    socket.on(
      'screen:stopped',
      wrapSocketHandler(socket, (data) =>
        handleScreenStopped(socket, io, data)
      )
    );

    socket.on(
      'screen:offer',
      wrapSocketHandler(socket, (data) =>
        handleScreenOffer(socket, io, data)
      )
    );

    socket.on(
      'screen:answer',
      wrapSocketHandler(socket, (data) =>
        handleScreenAnswer(socket, io, data)
      )
    );

    socket.on(
      'screen:ice-candidate',
      wrapSocketHandler(socket, (data) =>
        handleScreenICECandidate(socket, io, data)
      )
    );

    // Presence events
    socket.on(
      'presence:update',
      wrapSocketHandler(socket, (data) =>
        handlePresenceUpdate(socket, io, data)
      )
    );

    // Mentor availability events
    socket.on(
      'mentor-profile:watch',
      wrapSocketHandler(socket, (mentorId: string) =>
        handleMentorProfileWatch(socket, mentorId)
      )
    );

    socket.on(
      'mentor-profile:unwatch',
      wrapSocketHandler(socket, (mentorId: string) =>
        handleMentorProfileUnwatch(socket, mentorId)
      )
    );

    // Recording events
    socket.on(
      'recording:request',
      wrapSocketHandler(socket, (data) =>
        handleRecordingRequest(socket, io, data)
      )
    );

    socket.on(
      'recording:consent',
      wrapSocketHandler(socket, (data) =>
        handleRecordingConsent(socket, io, data)
      )
    );

    socket.on(
      'recording:stop',
      wrapSocketHandler(socket, (data) =>
        handleRecordingStop(socket, io, data)
      )
    );

    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id} (userId: ${userId})`);
      console.log(`   Total connected clients: ${io.engine.clientsCount}`);
    });

    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  });
}