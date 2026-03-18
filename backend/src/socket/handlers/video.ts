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
    const { sessionId, offer } = data;
    
    socket.to(`session:${sessionId}`).emit('video:offer', {
      offer,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Video offer error:', err);
  }
}

export async function handleVideoAnswer(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, answer } = data;
    
    socket.to(`session:${sessionId}`).emit('video:answer', {
      answer,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Video answer error:', err);
  }
}

export async function handleICECandidate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, candidate } = data;
    
    socket.to(`session:${sessionId}`).emit('video:ice-candidate', {
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
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Video end error:', err);
  }
}
