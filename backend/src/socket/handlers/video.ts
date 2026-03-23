import { Server as SocketIOServer, Socket } from 'socket.io';

export async function handleVideoInitiate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, initiatorId, receiverId } = data;
    
    io.to(`session:${sessionId}`).emit('video:incoming-call', {
      initiatorId,
      receiverId,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Video initiate error:', err);
  }
}

export async function handleVideoOffer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, peerId, offer, remoteUserId, initiatorId } = data;
    
    console.log('📨 Video offer received:', {
      sessionId,
      peerId,
      initiatorId,
      remoteUserId,
      socketId: socket.id,
      offerType: offer?.type
    });
    
    // Check room members
    const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
    console.log('👥 Room members when video offer received:', room ? Array.from(room) : 'No members');
    
    // Broadcast offer to session, including sender ID so recipient knows who to answer
    socket.to(`session:${sessionId}`).emit('video:offer', {
      peerId: socket.id, // Send socket ID so recipient knows who the offer is from
      offer,
      remoteUserId,
      initiatorId: initiatorId || socket.id,
      timestamp: Date.now(),
    });
    
    console.log(`📤 Video offer forwarded in session ${sessionId} to ${room ? room.size - 1 : 0} other users`);
  } catch (err) {
    console.error('Video offer error:', err);
  }
}

export async function handleVideoAnswer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, peerId, answer, initiatorId } = data;
    
    // Broadcast answer to session, including sender ID
    socket.to(`session:${sessionId}`).emit('video:answer', {
      peerId: socket.id, // Send socket ID so recipient knows who the answer is from
      answer,
      initiatorId: initiatorId || socket.id,
      timestamp: Date.now(),
    });
    
    console.log(`📤 Video answer forwarded in session ${sessionId}`);
  } catch (err) {
    console.error('Video answer error:', err);
  }
}

export async function handleICECandidate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, peerId, candidate } = data;
    
    // Broadcast ICE candidate to session, including sender ID
    socket.to(`session:${sessionId}`).emit('video:ice-candidate', {
      peerId: socket.id, // Send socket ID so recipient knows who the candidate is from
      candidate,
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
    
    console.log('🖥️ Screen share started:', { sessionId, userId, socketId: socket.id });
    
    // Check if user is in the session room
    const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
    console.log('👥 Current room members for screen share:', room ? Array.from(room) : 'No members');
    
    // Broadcast screen share started event to session
    socket.to(`session:${sessionId}`).emit('screen:started', {
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
    
    console.log('🛑 Screen share stopped:', { sessionId, userId, socketId: socket.id });
    
    // Broadcast screen share stopped event to session
    socket.to(`session:${sessionId}`).emit('screen:stopped', {
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
    
    // Broadcast screen offer to session
    socket.to(`session:${sessionId}`).emit('screen:offer', {
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
    
    // Broadcast screen answer to session
    socket.to(`session:${sessionId}`).emit('screen:answer', {
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
    
    // Broadcast screen ICE candidate to session
    socket.to(`session:${sessionId}`).emit('screen:ice-candidate', {
      peerId: socket.id,
      candidate,
      initiatorId: initiatorId || socket.id,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Screen ICE candidate error:', err);
  }
}
