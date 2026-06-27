import { Server as SocketIOServer, Socket } from 'socket.io';

export async function handleVideoInitiate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, initiatorId, receiverId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;

    io.to(roomName).emit('video:incoming-call', {
      initiatorId,
      receiverId,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Video initiate error:', err);
  }
}

export async function handleVideoConnectionRequest(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, userId, targetUserId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;

    console.log('🔄 Video connection request received:', { sessionId, userId, targetUserId });
    
    // Forward the connection request to the target user
    io.to(roomName).emit('video:connection-request', {
      sessionId,
      userId,
      targetUserId,
    });
  } catch (err) {
    console.error('Video connection request error:', err);
  }
}

export async function handleVideoOffer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, peerId, offer, remoteUserId, initiatorId, callerId, targetId } = data;

    console.log('📨 Video offer received:', {
      sessionId,
      peerId,
      callerId,
      targetId,
      initiatorId,
      remoteUserId,
      socketId: socket.id,
      offerType: offer?.type
    });

    // Validate that caller is part of the session
    const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
    if (!room || !room.has(callerId || socket.id)) {
      console.warn('⚠️ Video offer rejected: caller not in session', { callerId, sessionId });
      return;
    }

    // Broadcast offer to session, preserving user IDs (callerId, targetId)
    socket.to(roomName).emit('video:offer', {
      peerId: peerId || socket.id, // Use provided peerId or fallback to socket.id
      offer,
      callerId: callerId || socket.id, // Preserve user ID of offer sender
      targetId: targetId || remoteUserId, // Preserve target user ID
      remoteUserId,
      initiatorId: initiatorId || peerId || socket.id,
      timestamp: Date.now(),
    });

    console.log(`📤 Video offer forwarded in session ${sessionId} to ${room ? room.size - 1 : 0} other users`);
  } catch (err) {
    console.error('Video offer error:', err);
  }
}

export async function handleVideoAnswer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, peerId, answer, initiatorId, callerId, targetId } = data;

    console.log('📨 Video answer received:', {
      sessionId,
      peerId,
      callerId,
      targetId,
      initiatorId,
      socketId: socket.id
    });

    // Validate that caller is part of the session
    const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
    if (!room || !room.has(callerId || socket.id)) {
      console.warn('⚠️ Video answer rejected: caller not in session', { callerId, sessionId });
      return;
    }

    // Broadcast answer to session, preserving user IDs (callerId, targetId)
    socket.to(roomName).emit('video:answer', {
      peerId: peerId || socket.id, // Use provided peerId or fallback to socket.id
      answer,
      callerId: callerId || socket.id, // Preserve user ID of answer sender
      targetId: targetId, // Preserve target user ID
      initiatorId: initiatorId || peerId || socket.id,
      timestamp: Date.now(),
    });

    console.log(`📤 Video answer forwarded in session ${sessionId}`);
  } catch (err) {
    console.error('Video answer error:', err);
  }
}

export async function handleICECandidate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, peerId, candidate, callerId, targetId } = data;

    // Validate that caller is part of the session
    const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
    if (!room || !room.has(callerId || socket.id)) {
      console.warn('⚠️ ICE candidate rejected: caller not in session', { callerId, sessionId });
      return;
    }

    // Broadcast ICE candidate to session, preserving user IDs
    socket.to(roomName).emit('video:ice-candidate', {
      peerId: peerId || socket.id, // Use provided peerId or fallback to socket.id
      candidate,
      callerId: callerId || peerId || socket.id, // Preserve user ID of candidate sender
      targetId: targetId, // Preserve target ID
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('ICE candidate error:', err);
  }
}

export async function handleVideoEnd(socket: Socket, io: SocketIOServer) {
  try {
    // Broadcast video end to all users in socket namespace
    socket.emit('video:ended', {
      peerId: socket.id,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Video end error:', err);
  }
}

export async function handleScreenStarted(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, userId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;
    
    console.log('🖥️ Screen share started:', { sessionId, userId, socketId: socket.id });
    
    // Broadcast screen share started event to session
    socket.to(roomName).emit('screen:started', {
      userId,
      socketId: socket.id,
      timestamp: Date.now(),
    });
    
    console.log(`📤 Screen share started event forwarded in session ${sessionId}`);
  } catch (err) {
    console.error('Screen share started error:', err);
  }
}

export async function handleScreenStopped(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, userId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;
    
    console.log('🛑 Screen share stopped:', { sessionId, userId, socketId: socket.id });
    
    // Broadcast screen share stopped event to session
    socket.to(roomName).emit('screen:stopped', {
      userId,
      socketId: socket.id,
      timestamp: Date.now(),
    });
    
    console.log(`📤 Screen share stopped event forwarded in session ${sessionId}`);
  } catch (err) {
    console.error('Screen share stopped error:', err);
  }
}

export async function handleScreenOffer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, offer, initiatorId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;
    
    // Broadcast screen offer to session
    socket.to(roomName).emit('screen:offer', {
      peerId: socket.id,
      offer,
      initiatorId: initiatorId || socket.id,
      timestamp: Date.now(),
    });
    
    console.log(`📤 Screen offer forwarded in session ${sessionId}`);
  } catch (err) {
    console.error('Screen offer error:', err);
  }
}

export async function handleScreenAnswer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, answer, initiatorId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;
    
    // Broadcast screen answer to session
    socket.to(roomName).emit('screen:answer', {
      peerId: socket.id,
      answer,
      initiatorId: initiatorId || socket.id,
      timestamp: Date.now(),
    });
    
    console.log(`📤 Screen answer forwarded in session ${sessionId}`);
  } catch (err) {
    console.error('Screen answer error:', err);
  }
}

export async function handleScreenICECandidate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, candidate, initiatorId } = data;
    const roomName = `session:${sessionId}`;
    
    if (!socket.rooms.has(roomName)) return;
    
    // Broadcast screen ICE candidate to session
    socket.to(roomName).emit('screen:ice-candidate', {
      peerId: socket.id,
      candidate,
      initiatorId: initiatorId || socket.id,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Screen ICE candidate error:', err);
  }
}
