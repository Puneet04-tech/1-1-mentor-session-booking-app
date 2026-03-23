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
  handleScreenStarted,
  handleScreenStopped,
  handleScreenOffer,
  handleScreenAnswer,
  handleScreenICECandidate,
} from './handlers/video';
import {
  handlePresenceUpdate,
} from './handlers/presence';

export function setupSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Code editor events
    socket.on('code:update', (data) => handleCodeUpdate(socket, io, data));
    socket.on('cursor:move', (data) => handleCursorMove(socket, io, data));
    socket.on('language:change', (data) => handleLanguageChange(socket, io, data));

    // Chat events
    socket.on('message:send', (data) => handleMessageSend(socket, io, data));
    socket.on('session:join', (data) => handleSessionJoin(socket, io, data));
    socket.on('session:leave', (data) => handleSessionLeave(socket, io, data));

    // Video events
    socket.on('video:initiate', (data) => handleVideoInitiate(socket, io, data));
    socket.on('video:offer', (data) => handleVideoOffer(socket, io, data));
    socket.on('video:answer', (data) => handleVideoAnswer(socket, io, data));
    socket.on('video:ice-candidate', (data) => handleICECandidate(socket, io, data));
    socket.on('video:end', () => handleVideoEnd(socket, io));

    // Screen share events
    socket.on('screen:started', (data) => handleScreenStarted(socket, io, data));
    socket.on('screen:stopped', (data) => handleScreenStopped(socket, io, data));
    socket.on('screen:offer', (data) => handleScreenOffer(socket, io, data));
    socket.on('screen:answer', (data) => handleScreenAnswer(socket, io, data));
    socket.on('screen:ice-candidate', (data) => handleScreenICECandidate(socket, io, data));

    // Presence events
    socket.on('presence:update', (data) => handlePresenceUpdate(socket, io, data));

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
}
