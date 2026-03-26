import { socketService } from './socket';
import { webrtcDiagnostics } from './webrtcDiagnostics';

interface RTCConfig {
  iceServers: RTCIceServer[];
}

export class WebRTCService {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private mentorStreamCreated: Map<string, boolean> | null = null;
  private onLocalStream: ((stream: MediaStream) => void) | null = null;
  private onRemoteStream: ((stream: MediaStream, peerId: string) => void) | null = null;
  private onScreenShare: ((stream: MediaStream, peerId: string) => void) | null = null;
  private onStreamEnded: ((peerId: string) => void) | null = null;
  private sessionId: string | null = null;
  private userId: string | null = null;
  private remoteUserId: string | null = null;
  private initiateConnectionInProgress = false;
  private userRole: 'mentor' | 'student' | null = null;
  private listenersSetup = false;

  private rtcConfig: RTCConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
  };

  constructor() {
    // Don't setup listeners here - wait until socket is ready (lazy initialization)
    console.log('🎬 WebRTCService initialized (listeners will be setup on first use)');
  }

  private setupSocketListeners() {
    // Prevent duplicate listener registration
    if (this.listenersSetup) {
      console.log('🔌 Socket listeners already setup, skipping...');
      return;
    }

    // Check if socket is ready
    if (!socketService.isConnected()) {
      console.warn('⚠️ Socket not connected yet, retrying in 500ms...');
      setTimeout(() => this.setupSocketListeners(), 500);
      return;
    }

    this.listenersSetup = true; // Mark as setup before registering
    console.log('🔌 Setting up WebRTC socket listeners (once per session)');
    
    socketService.on('video:offer', (data: any) => {
      console.log('📨 [LISTENER] video:offer received');
      this.handleVideoOffer(data);
    });
    socketService.on('video:answer', (data: any) => {
      console.log('📨 [LISTENER] video:answer received');
      this.handleVideoAnswer(data);
    });
    socketService.on('video:ice-candidate', (data: any) => {
      console.log('📨 [LISTENER] video:ice-candidate received');
      this.handleICECandidate(data);
    });
    socketService.on('screen:offer', (data: any) => {
      console.log('📨 [LISTENER] screen:offer received');
      this.handleScreenOffer(data);
    });
    socketService.on('screen:answer', (data: any) => {
      console.log('📨 [LISTENER] screen:answer received');
      this.handleScreenAnswer(data);
    });
    socketService.on('screen:ice-candidate', (data: any) => {
      console.log('📨 [LISTENER] screen:ice-candidate received');
      this.handleScreenICECandidate(data);
    });
    socketService.on('video:connection-request', (data: any) => {
      console.log('📨 [LISTENER] video:connection-request received');
      this.handleConnectionRequest(data);
    });
    socketService.on('screen:started', (data: any) => {
      console.log('📨 [LISTENER] screen:started received');
      this.handleScreenStarted(data);
    });
    socketService.on('screen:stopped', (data: any) => {
      console.log('📨 [LISTENER] screen:stopped received');
      this.handleScreenStopped(data);
    });
    socketService.on('video:stream-ended', (data: any) => {
      console.log('📨 [LISTENER] video:stream-ended received');
      this.handleStreamEnded(data);
    });
    
    console.log('✅ WebRTC socket listeners setup complete');
  }

  async startLocalVideo(sessionId: string, userId: string): Promise<MediaStream> {
    try {
      this.sessionId = sessionId;
      this.userId = userId;

      console.log(`� Starting local video - Session: ${sessionId}, User: ${userId}`);

      // Setup socket listeners now (lazy initialization)
      this.setupSocketListeners();

      // Try with basic constraints first, then fallback to looser constraints
      let constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      };

      console.log('📢 Requesting camera/microphone permissions...');
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Permissions granted with ideal constraints');
      } catch (err: any) {
        console.warn('⚠️ Failed with ideal constraints, trying basic:', err.message);
        constraints = { audio: true, video: true };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Got stream with basic constraints');
      }

      // Log stream details
      console.log('📊 Local stream details:', {
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length,
        totalTracks: this.localStream.getTracks().length,
      });

      // Listen for stream ended
      this.localStream.getTracks().forEach((track) => {
        track.onended = () => {
          console.log('⏹️ Local track ended:', track.kind);
          this.stopLocalVideo();
        };
      });

      if (this.onLocalStream) {
        this.onLocalStream(this.localStream);
      }

      console.log('✅ Local video started');
      return this.localStream;
    } catch (err: any) {
      const errorMsg = err?.name || err?.message || String(err);
      console.error('❌ Error starting local video:', errorMsg);
      throw new Error(`Failed to start local video: ${errorMsg}`);
    }
  }

  async startScreenShare(sessionId: string, userId: string, screenStream: MediaStream): Promise<void> {
    try {
      console.log('🖥️ WebRTCService.startScreenShare called', { sessionId, userId, hasStream: !!screenStream });
      
      if (!screenStream) {
        console.error('❌ Screen stream not provided');
        throw new Error('Screen stream must be provided to startScreenShare');
      }

      this.screenStream = screenStream;
      console.log('✅ Screen share stream stored');

      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        throw new Error('No video track in screen stream');
      }
      
      // Send screen through a SEPARATE peer connection for each remote peer
      // This ensures the student gets ontrack event with the screen track
      for (const [peerId, peerConnection] of this.peerConnections) {
        // Skip screen peer connections
        if (peerId.startsWith('screen:')) continue;
        
        console.log(`🖥️ Setting up screen share peer connection for: ${peerId}`);
        
        // Get or create screen peer connection (with screen:${peerId} key)
        const screenPeerId = `screen:${peerId}`;
        let screenPeerConnection = this.peerConnections.get(screenPeerId);
        
        if (!screenPeerConnection) {
          console.log(`🖥️ Creating new SCREEN-ONLY peer connection for: ${peerId}`);
          screenPeerConnection = this.createScreenPeerConnection(screenPeerId);
        }

        try {
          // Add screen track to the screen peer connection
          console.log('📹 Adding screen track to screen peer connection');
          screenPeerConnection.addTrack(screenTrack, this.screenStream);
          
          // Create and send offer for screen share
          console.log('📤 Creating screen offer');
          const offer = await screenPeerConnection.createOffer();
          await screenPeerConnection.setLocalDescription(offer);
          
          socketService.emit('screen:offer', {
            sessionId,
            peerId,
            fromUserId: userId,
            offer: screenPeerConnection.localDescription,
          } as any);
          console.log('📤 Screen offer sent to:', peerId);
        } catch (offerErr) {
          console.error('❌ Error setting up screen peer connection:', offerErr);
        }
      }

      // Listen for screen share stop
      screenTrack.onended = () => {
        console.log('Screen share ended (user clicked Stop Sharing)');
        this.stopScreenShare();
      };

      // Notify backend and peers
      socketService.emit('screen:started', {
        sessionId,
        userId,
      } as any);

      console.log('✅ Screen sharing started with separate peer connection');
    } catch (err: any) {
      console.error('Screen share error:', err);
      throw err;
    }
  }

  private createScreenPeerConnection(peerId: string): RTCPeerConnection {
    console.log(`🖥️ [SCREEN-PC] Creating SCREEN-ONLY peer connection for: ${peerId}`);
    
    const peerConnection = new RTCPeerConnection({
      iceServers: this.rtcConfig.iceServers,
    });

    // DO NOT add local stream - screen peer connection is SCREEN ONLY
    // Initialize with sendrecv transceiver so both mentor and student can send/receive screen
    try {
      peerConnection.addTransceiver('video', { 
        direction: 'sendrecv',  // Both sides can send and receive screen
        streams: [] 
      });
      console.log('✅ [SCREEN-PC] Added sendrecv video transceiver');
    } catch (err) {
      console.warn('⚠️ [SCREEN-PC] Could not add transceiver:', err);
    }

    // Handle ontrack - MENTOR will receive screen track here too!
    peerConnection.ontrack = (event) => {
      console.log('🖥️ [SCREEN-PC:ONTRACK] ===== SCREEN TRACK RECEIVED =====');
      console.log('🖥️ [SCREEN-PC:ONTRACK] Track details:', {
        trackKind: event.track.kind,
        trackId: event.track.id,
        trackLabel: event.track.label,
        trackEnabled: event.track.enabled,
        streamsLength: event.streams.length,
        peerId,
        hasOnScreenShareCallback: !!this.onScreenShare,
      });
      
      if (event.streams && event.streams.length > 0) {
        const screenStream = event.streams[0];
        console.log('🖥️ [SCREEN-PC:ONTRACK] Screen stream details:', {
          streamId: screenStream.id,
          trackCount: screenStream.getTracks().length,
          tracks: screenStream.getTracks().map(t => ({ kind: t.kind, id: t.id, label: t.label, enabled: t.enabled }))
        });
        
        if (this.onScreenShare) {
          console.log('🖥️ [SCREEN-PC:ONTRACK] ✅ Calling onScreenShare callback');
          try {
            this.onScreenShare(screenStream, peerId);
            console.log('🖥️ [SCREEN-PC:ONTRACK] ✅ onScreenShare callback executed successfully');
          } catch (err) {
            console.error('🖥️ [SCREEN-PC:ONTRACK] ❌ Error in onScreenShare callback:', err);
          }
        } else {
          console.warn('🖥️ [SCREEN-PC:ONTRACK] ⚠️ NO onScreenShare CALLBACK SET!');
        }
      } else {
        console.warn('🖥️ [SCREEN-PC:ONTRACK] ⚠️ No streams in ontrack event');
      }
    };

    // Handle ICE candidates for screen peer connection
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 [SCREEN-PC] Sending screen ICE candidate');
        socketService.emit('screen:ice-candidate', {
          sessionId: this.sessionId,
          peerId: this.userId,
          targetId: peerId.replace('screen:', ''),
          candidate: event.candidate,
        } as any);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🖥️ [SCREEN-PC] Connection state with ${peerId}: ${peerConnection.connectionState}`);
    };

    this.peerConnections.set(peerId, peerConnection);
    return peerConnection;
  }

  private async createAndSendOffer(pc: RTCPeerConnection, peerId: string) {
    try {
      console.log(`📡 Manually creating and sending offer to ${peerId}`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketService.emit('video:offer', {
        sessionId: this.sessionId,
        fromUserId: this.userId,
        targetId: peerId,
        offer: pc.localDescription
      } as any);
      console.log(`✅ Manual offer sent to ${peerId}`);
    } catch (err) {
      console.error(`❌ Error in manual offer for ${peerId}:`, err);
    }
  }

  async stopScreenShare() {
    try {
      if (this.screenStream) {
        console.log('🛑 Stopping screen share...');
        this.screenStream.getTracks().forEach((track) => track.stop());
        this.screenStream = null;

        // Close all screen peer connections
        const screenPeerIds: string[] = [];
        for (const [peerId] of this.peerConnections) {
          if (peerId.startsWith('screen:')) {
            screenPeerIds.push(peerId);
          }
        }
        
        screenPeerIds.forEach(peerId => {
          const pc = this.peerConnections.get(peerId);
          if (pc) {
            console.log(`🛑 Closing screen peer connection: ${peerId}`);
            pc.close();
            this.peerConnections.delete(peerId);
          }
        });
        
        // Notify backend and peers
        socketService.emit('screen:stopped', {
          sessionId: this.sessionId,
          userId: this.userId,
        } as any);

        console.log('✅ Screen sharing stopped');
      }
    } catch (err) {
      console.error('❌ Error stopping screen share:', err);
    }
  }

  stopLocalVideo() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
      console.log('Local video stopped');
    }
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    try {
      let peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        peerConnection = this.createPeerConnection(peerId);
      }

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error('Error creating offer:', err);
      throw err;
    }
  }

  async handleVideoOffer(data: any) {
    try {
      const { offer, callerId, targetId, peerId } = data;
      const fromUserId = callerId || peerId;
      console.log('📨 RECEIVED VIDEO OFFER', {
        callerId,
        targetId,
        peerId,
        offerExists: !!offer,
        currentRemoteUserId: this.remoteUserId,
      });
      console.log('📊 Current peer connections BEFORE:', Array.from(this.peerConnections.keys()));
      
      // Store the remote user ID for later matching
      if (fromUserId) {
        this.remoteUserId = fromUserId;
        console.log('💾 Stored remote user ID (offer sender):', this.remoteUserId);
      }
      
      // Use callerId (offerer's user ID) as the peer connection key
      // This way when the offerer sends us their answer with callerId matching their user ID,
      // we'll look for PC with that ID
      const senderUserId = fromUserId;
      const actualPeerId = senderUserId || 'unknown-peer';
      console.log(`🔌 Will use peer connection key: ${actualPeerId}`);
      
      // Store the remote user ID for matching
      if (actualPeerId !== 'unknown-peer') {
        this.remoteUserId = actualPeerId;
      }
      
      // Check if we already have a peer connection for this peer
      let peerConnection = this.peerConnections.get(actualPeerId);
      
      if (peerConnection) {
        // Already have a connection - check its state
        console.log(`📊 Existing peer connection found with key ${actualPeerId}, state: ${peerConnection.signalingState}`);
        
      // COLLISION LOGIC: Mentor priority
      if (peerConnection.signalingState === 'have-local-offer') {
        const isMentor = this.userRole === 'mentor';
        console.log('⚠️ COLLISION DETECTED: Peer connection already has local offer in flight');
        console.log('📊 Collision details:', { isMentor, offererRole: isMentor ? 'mentor' : 'student', signalingState: peerConnection.signalingState });
        
        // In WebRTC connection collision, the "polite" peer should defer.
        // We'll treat the student as the polite peer.
        if (isMentor) {
          console.log('👑 Mentor (Me) wins connection collision. Ignoring incoming offer (waiting for our own offer to be accepted).');
          return;
        } else {
          console.warn('⚠️ Student (Me) losing connection collision. Trying to reset and accept mentor offer.');
          // Try to close the connection and recreate it fresh
          try {
            peerConnection.close();
          } catch (e) {
            console.warn('Error closing connection:', e);
          }
          this.peerConnections.delete(actualPeerId);
          peerConnection = this.createPeerConnection(actualPeerId);
          console.log('✅ Recreated peer connection, ready for incoming offer');
        }
      } else if (peerConnection.signalingState !== 'stable') {
        console.warn(`⚠️ Ignoring offer - peer connection in state: ${peerConnection.signalingState}`);
        return;
      }
      } else {
        console.log(`🔌 Creating NEW peer connection with KEY: ${actualPeerId}`);
        peerConnection = this.createPeerConnection(actualPeerId);
      }

      const signalingState = peerConnection.signalingState;
      console.log(`📊 About to set remote offer, current state: ${signalingState}`);
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('✅ Set remote description (offer)');
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('✅ Created and set local description (answer)');

      // Send answer with user IDs so remote can match
      socketService.emit('video:answer', {
        sessionId: this.sessionId,
        callerId: this.userId,        // My user ID (answer sender)
        targetId: actualPeerId,       // Offer sender's user ID
        userId: this.userId,          // Standard field
        answer,
      } as any);
      console.log('📤 Sent video answer', {
        callerId: this.userId,
        targetId: actualPeerId,
      });
    } catch (err) {
      console.error('❌ Error handling video offer:', err);
    }
  }

  async handleVideoAnswer(data: any) {
    try {
      const { answer, callerId, targetId, userId, peerId } = data;
      console.log('📨 Received video answer', {
        callerId,
        targetId,
        userId,
        peerId,
        hasAnswer: !!answer,
        currentRemoteUserId: this.remoteUserId,
        myUserId: this.userId,
      });
      console.log('📊 Current peer connections:', Array.from(this.peerConnections.keys()));
      
      // The answer is from callerId (answer sender). Match it with our initiated connection
      const actualPeerId = callerId || userId || targetId || peerId || this.remoteUserId;
      
      if (!actualPeerId) {
        console.warn('⚠️ Could not determine peer ID for answer');
        return;
      }
      
      console.log('🔍 Looking for peer connection with key:', actualPeerId);
      let peerConnection = this.peerConnections.get(actualPeerId);
      
      if (!peerConnection) {
        console.warn('⚠️ Peer connection NOT found with key:', actualPeerId);
        // Fallback: search for any connection that is in have-local-offer state
        for (const [id, pc] of this.peerConnections) {
          if (pc.signalingState === 'have-local-offer') {
            console.log(`🔄 Found pending connection with ID ${id}, using as fallback for answer`);
            peerConnection = pc;
            break;
          }
        }
      }
      
      if (peerConnection) {
        const signalingState = peerConnection.signalingState;
        console.log(`📊 Peer connection signaling state: ${signalingState}`);
        console.log('📊 Peer connection details:', {
          signalingState,
          iceConnectionState: peerConnection.iceConnectionState,
          connectionState: peerConnection.connectionState,
          senders: peerConnection.getSenders().length,
          receivers: peerConnection.getReceivers().length,
        });
        
        // Only set remote description if signaling state allows
        if (signalingState === 'have-local-offer') {
          console.log('✅ Setting remote answer...');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('✅ Set remote description (answer) - connection should now be establishing');
          console.log('📊 After setting remote answer:', {
            signalingState: peerConnection.signalingState,
            iceConnectionState: peerConnection.iceConnectionState,
            connectionState: peerConnection.connectionState,
          });
        } else {
          console.warn(`⚠️ Cannot set remote answer - wrong state: ${signalingState}. Expected 'have-local-offer'`);
          console.log('📊 Current connection state:', {
            signalingState,
            iceConnectionState: peerConnection.iceConnectionState,
            connectionState: peerConnection.connectionState,
          });
        }
      } else {
        console.warn('⚠️ No peer connection found for answer');
        console.log('📊 Answer data:', { callerId, targetId, peerId });
        console.log('📊 Stored remoteUserId:', this.remoteUserId);
      }
    } catch (err) {
      console.error('❌ Error handling video answer:', err);
    }
  }

  async handleICECandidate(data: any) {
    try {
      const { candidate, callerId, targetId, peerId } = data;
      console.log('📨 Received ICE candidate', {
        callerId,
        targetId,
        peerId,
        hasCandidate: !!candidate,
      });
      
      // The candidate is from callerId (remote)
      let actualPeerId = callerId || this.remoteUserId || targetId || peerId;
      
      if (!actualPeerId) {
        console.warn('⚠️ Could not determine peer ID for ICE candidate - checking all connections');
        // If we can't find the peer, broadcast to all existing connections as a last resort
        for (const [id, pc] of this.peerConnections) {
          if (pc.signalingState !== 'closed' && candidate) {
             pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn('ICE add error on broadcast:', e));
          }
        }
        return;
      }
      
      let peerConnection = this.peerConnections.get(actualPeerId);
      
      // If peer connection doesn't exist yet, try basic name
      if (!peerConnection) {
        console.log(`🔍 Peer connection for ${actualPeerId} not found, checking generic ones...`);
        // Fallback for single-peer sessions
        if (this.peerConnections.size === 1) {
          peerConnection = Array.from(this.peerConnections.values())[0];
          console.log('🔄 Single connection found, using it for ICE');
        }
      }
      
      if (peerConnection && candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ Added ICE candidate');
        } catch (err) {
          console.warn('⚠️ Error adding ICE candidate (might be duplicate):', err);
        }
      } else {
        console.warn('⚠️ Could not add ICE candidate - no peer connection for:', actualPeerId);
      }
    } catch (err) {
      console.error('❌ Error handling ICE candidate:', err);
    }
  }

  // Screen sharing handlers (similar to video)
  async handleScreenOffer(data: any) {
    try {
      const { peerId, offer } = data;
      console.log('📨 Received screen offer from', peerId);
      
      // Create SCREEN-ONLY peer connection if not exists
      let peerConnection = this.peerConnections.get(`screen:${peerId}`);
      if (!peerConnection) {
        console.log('🖥️ Creating new screen peer connection for screen:' + peerId);
        peerConnection = this.createScreenPeerConnection(`screen:${peerId}`);
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socketService.emit('screen:answer', {
        sessionId: this.sessionId,
        peerId,
        answer,
      } as any);
      console.log('📤 Screen answer sent');
    } catch (err) {
      console.error('Error handling screen offer:', err);
    }
  }

  async handleScreenAnswer(data: any) {
    try {
      const { peerId, answer } = data;
      console.log('📨 Received screen answer from', peerId);
      
      const peerConnection = this.peerConnections.get(`screen:${peerId}`);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Set remote screen answer');
      }
    } catch (err) {
      console.error('Error handling screen answer:', err);
    }
  }

  async handleScreenICECandidate(data: any) {
    try {
      const { peerId, candidate } = data;
      console.log('📨 Received screen ICE candidate from', peerId);
      
      const peerConnection = this.peerConnections.get(`screen:${peerId}`);
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Added screen ICE candidate');
      }
    } catch (err) {
      console.error('Error handling screen ICE candidate:', err);
    }
  }

  async handleScreenStarted(data: any) {
    try {
      const { userId, socketId } = data;
      console.log('🖥️ Screen share started from user:', userId);
      
      // If we are not the one who started it, we should prepare to receive it
      if (userId !== this.userId) {
        console.log('👀 Preparing to receive remote screen share');
        // The peer connection already has a transceiver for this (recvonly)
        // because we added it in createPeerConnection.
        // Once the remote peer starts sending (renegotiates), our ontrack will fire.
      }
    } catch (err) {
      console.error('Error handling screen share started:', err);
    }
  }

  async handleScreenStopped(data: any) {
    try {
      const { userId, socketId } = data;
      console.log('🛑 Screen share stopped from user:', userId);
      
      // TODO: Handle remote screen share stopped
      // This would typically clean up screen share UI and peer connections
    } catch (err) {
      console.error('Error handling screen share stopped:', err);
    }
  }

  handleStreamEnded(data: any) {
    const { peerId } = data;
    this.closePeerConnection(peerId);
    
    if (this.onStreamEnded) {
      this.onStreamEnded(peerId);
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const peerConnection = new RTCPeerConnection({
      iceServers: this.rtcConfig.iceServers,
    });

    console.log(`🔗 Creating peer connection for: ${peerId}`);
    console.log(`📊 Local stream details:`, {
      exists: !!this.localStream,
      trackCount: this.localStream?.getTracks().length || 0,
      audioTracks: this.localStream?.getAudioTracks().length || 0,
      videoTracks: this.localStream?.getVideoTracks().length || 0,
    });
    webrtcDiagnostics.log('peer-connection', 'Creating peer connection', {
      peerId,
      hasLocalStream: !!this.localStream,
    });

    // Add local stream tracks using transceivers for better compatibility
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      console.log(`📋 Adding ${tracks.length} tracks to peer connection`);
      webrtcDiagnostics.log('track-add', `Adding ${tracks.length} local tracks`, {
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length,
        peerId,
      });
      
      // Use addTransceiver with sendrecv to both send our stream AND receive remote stream
      tracks.forEach((track) => {
        try {
          // IMPORTANT: Explicitly set direction and ensure streams are correctly assigned
          const transceiver = peerConnection.addTransceiver(track, {
            streams: [this.localStream!],
            direction: 'sendrecv',
          });
          console.log(`✅ Added ${track.kind} transceiver (enabled: ${track.enabled}, direction: ${transceiver.direction})`);
          
          // Force track to be enabled
          track.enabled = true;
          
          if (transceiver.receiver && transceiver.receiver.track) {
            console.log(`📡 Receiver for ${track.kind} track initialized: ID=${transceiver.receiver.track.id}`);
          }
        } catch (err) {
          console.error(`❌ Error adding ${track.kind} transceiver:`, err);
        }
      });
      
      // ALSO ADD AN EXTRA VIDEO TRANSCEIVER for receiving potential secondary streams (like screen share)
      // Use unique transceivers for audio and video to avoid mixing
      try {
        peerConnection.addTransceiver('video', { 
          direction: 'recvonly',
          streams: [] 
        });
        console.log('✅ Added extra video transceiver for prospective screen share reception');
      } catch (err) {
        console.warn('⚠️ Could not add extra receiver transceiver:', err);
      }
    } else {
      console.warn('⚠️ No local stream available when creating peer connection! Adding recvonly transceivers.');
      // Add transceivers anyway to be able to receive
      try {
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
        peerConnection.addTransceiver('video', { direction: 'recvonly' }); // For screen share
      } catch (err) {
        console.error('❌ Error adding recvonly transceivers:', err);
      }
    }

    // Explicitly add STUN/TURN servers for cross-network connectivity if not working
    // (RTCConfig is already defined above with Google STUNs)

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
        socketService.emit('video:ice-candidate', {
          sessionId: this.sessionId,
          peerId: this.userId,
          callerId: this.userId,
          targetId: peerId, // Ensure targetId is sent back for matching
          candidate: event.candidate,
        } as any);
      }
    };

    // Handle remote stream - THIS IS CRITICAL
    peerConnection.ontrack = (event) => {
      console.log('✅✅✅ ONTRACK FIRED! ✅✅✅');
      console.log('🔥 ONTRACK EVENT DETAILS:', {
        trackKind: event.track.kind,
        trackId: event.track.id,
        trackEnabled: event.track.enabled,
        trackReadyState: event.track.readyState,
        streamsCount: event.streams.length,
        peerId: peerId,
        hasCallback: !!this.onRemoteStream,
      });
      webrtcDiagnostics.log('track-receive', 'Remote track received', {
        kind: event.track.kind,
        trackId: event.track.id,
        streamCount: event.streams.length,
        enabled: event.track.enabled,
      });
      
      console.log('📹 Received remote track:', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        streamCount: event.streams.length,
        trackLabel: event.track?.label,
        trackId: event.track?.id,
      });
      
      if (event.streams && event.streams.length > 0) {
        const remoteStream = event.streams[0];
        console.log(`✅ Remote stream has ${remoteStream.getTracks().length} tracks`, {
          streamId: remoteStream.id,
          tracks: remoteStream.getTracks().map(t => ({ kind: t.kind, id: t.id, enabled: t.enabled }))
        });
        webrtcDiagnostics.log('track-receive', `Remote stream received with ${remoteStream.getTracks().length} tracks`, {
          streamId: remoteStream.id,
          trackCount: remoteStream.getTracks().length,
          peerId,
        });
        
        console.log('🔍 Stream tracks details:', remoteStream.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          id: t.id
        })));
        
        // Check if this is a screen share track
        const tracks = remoteStream.getTracks();
        const videoTrack = tracks.find(t => t.kind === 'video');
        
        const isScreenShareTrack = videoTrack && (
          videoTrack.label?.includes('screen') || 
          videoTrack.label?.includes('display') || 
          videoTrack.label?.includes('monitor') ||
          (videoTrack as any).settings?.displaySurface ||
          videoTrack.label?.includes('Share') ||
          videoTrack.label?.includes('Capture')
        );
        
        console.log('🔍 Track analysis:', {
          isScreenShareTrack,
          trackLabel: videoTrack?.label,
          trackKind: videoTrack?.kind,
          callbackCheck: {
            hasRemoteStreamCallback: !!this.onRemoteStream,
            hasScreenShareCallback: !!this.onScreenShare,
          }
        });
        
        // VERIFY CALLBACKS ARE SET BEFORE CALLING
        console.log('🎯 Before callback check:', {
          hasRemoteStreamCallback: !!this.onRemoteStream,
          hasScreenShareCallback: !!this.onScreenShare,
          isScreenShare: isScreenShareTrack,
        });
        webrtcDiagnostics.log('callback-fire', 'About to call callback', {
          hasRemoteStreamCallback: !!this.onRemoteStream,
          hasScreenShareCallback: !!this.onScreenShare,
          isScreenShare: isScreenShareTrack,
        });
        
        if (isScreenShareTrack && this.onScreenShare) {
          console.log('🖥️ Detected screen share track, calling onScreenShare callback');
          webrtcDiagnostics.log('callback-fire', 'Calling onScreenShare', { peerId });
          this.onScreenShare(remoteStream, peerId);
        } else if (this.onRemoteStream) {
          console.log('📹 Detected regular video track, calling onRemoteStream callback');
          console.log('🔍 Callback function exists:', !!this.onRemoteStream);
          console.log('🔍 Stream object:', { id: remoteStream.id, trackCount: remoteStream.getTracks().length });
          webrtcDiagnostics.log('callback-fire', 'Calling onRemoteStream', {
            streamId: remoteStream.id,
            trackCount: remoteStream.getTracks().length,
            peerId,
          });
          try {
            console.log('🚀 About to invoke onRemoteStream callback...');
            this.onRemoteStream(remoteStream, peerId);
            console.log('✅ onRemoteStream callback called successfully');
            webrtcDiagnostics.log('callback-fire', 'onRemoteStream callback executed', { peerId });
          } catch (callbackErr) {
            console.error('❌ ERROR IN CALLBACK:', callbackErr);
            webrtcDiagnostics.log('error', 'Error in onRemoteStream callback', { error: String(callbackErr) });
          }
        } else {
          console.error('❌ NO CALLBACK SET! this.onRemoteStream is:', this.onRemoteStream);
          console.error('❌ this.onScreenShare is:', this.onScreenShare);
          webrtcDiagnostics.log('error', 'No onRemoteStream callback set', {
            peerId,
            hasCallback: !!this.onRemoteStream,
          });
        }
      } else {
        console.warn('⚠️ Remote track received but no streams array');
        console.warn('⚠️ Event streams:', event.streams);
        webrtcDiagnostics.log('error', 'Remote track received but no streams', { peerId });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      const iceState = peerConnection.iceConnectionState;
      const sigState = peerConnection.signalingState;
      
      console.log(`🔄 Connection state with ${peerId}: ${state}`);
      console.log(`📊 Full connection status:`, {
        connectionState: state,
        iceConnectionState: iceState,
        signalingState: sigState,
        senders: peerConnection.getSenders().length,
        receivers: peerConnection.getReceivers().length,
      });
      webrtcDiagnostics.log('state-change', `Connection state: ${state}`, {
        iceState,
        sigState,
        senders: peerConnection.getSenders().length,
        receivers: peerConnection.getReceivers().length,
      });
      
      // Once connected, verify we have receivers ready for tracks
      if (state === 'connected') {
        console.log('✅ Peer connection CONNECTED - checking for inbound tracks...');
        const receivers = peerConnection.getReceivers();
        console.log(`📊 Receivers ready: ${receivers.length}`, receivers.map(r => ({
          kind: r.track?.kind,
          trackId: r.track?.id,
          trackEnabled: r.track?.enabled,
        })));
        webrtcDiagnostics.log('state-change', 'Connection established, checking receivers', {
          receiverCount: receivers.length,
        });
      }
      
      // Only close on truly failed states
      if (state === 'failed') {
        console.error('❌ Peer connection FAILED - attempting recovery');
        webrtcDiagnostics.log('error', 'Connection failed', { peerId });
        setTimeout(() => {
          if (peerConnection.connectionState === 'failed') {
            console.log('🔌 Closing failed peer connection after delay');
            this.closePeerConnection(peerId);
          }
        }, 5000);
      } else if (state === 'disconnected') {
        console.warn('⚠️ Peer connection disconnected - may reconnect');
      }
    };

    // Handle ICE connection state - THIS IS CRITICAL FOR MEDIA FLOW
    peerConnection.oniceconnectionstatechange = () => {
      const iceState = peerConnection.iceConnectionState;
      console.log(`🧊 ICE connection state with ${peerId}: ${iceState}`);
      console.log(`🧊 ICE STATE CHANGE - Full diagnosis:`, {
        iceConnectionState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState,
        signalingState: peerConnection.signalingState,
        sendersCount: peerConnection.getSenders().length,
        receiversCount: peerConnection.getReceivers().length,
        receiversWithTracks: peerConnection.getReceivers().filter(r => !!r.track).length,
      });
      webrtcDiagnostics.log('state-change', `ICE state: ${iceState}`, { peerId });
      
      if (iceState === 'connected' || iceState === 'completed') {
        console.log('✅✅✅ ICE CONNECTED - Media should now flow! ✅✅✅');
        console.log('📊 Checking for media tracks:');
        
        // Check receivers for incoming media
        const receivers = peerConnection.getReceivers();
        console.log(`   Receivers: ${receivers.length}`, receivers.map(r => ({
          kind: r.track?.kind,
          trackId: r.track?.id,
          trackEnabled: r.track?.enabled,
          trackReadyState: r.track?.readyState,
          hasTrack: !!r.track,
        })));
        
        // Check senders for outgoing media
        const senders = peerConnection.getSenders();
        console.log(`   Senders: ${senders.length}`, senders.map(s => ({
          kind: s.track?.kind,
          trackId: s.track?.id,
          trackEnabled: s.track?.enabled,
          hasTrack: !!s.track,
        })));
        
        webrtcDiagnostics.log('state-change', 'ICE connected', {
          receiverCount: receivers.length,
          senderCount: senders.length,
        });
      } else if (iceState === 'failed') {
        console.error('❌ ICE connection FAILED - Network may be blocked or TURN server needed');
        console.error('❌ ICE FAILED - Checking connection details:', {
          iceGatheringState: peerConnection.iceGatheringState,
          connectionState: peerConnection.connectionState,
          signalingState: peerConnection.signalingState,
        });
        webrtcDiagnostics.log('error', 'ICE failed', { peerId });
      } else if (iceState === 'checking') {
        console.log('🔍 ICE is gathering and checking candidates...');
      } else if (iceState === 'disconnected') {
        console.warn('⚠️ ICE disconnected - connection may be re-establishing');
      }
    };

    // NOTE: Receiver monitor is DISABLED because ontrack handler is reliable and works properly.
    // Having both enabled causes duplicate stream assignments which interrupt play() requests.
    // The ontrack event (via RTCRtpReceiver) is the standard way to handle incoming media and fires
    // when the browser receives the remote stream, which happens correctly in modern browsers.
    // This simplification fixes the "AbortError: play() request interrupted by new load request" issue.
    console.log('✅ [INFO] Receiver monitor disabled - relying on ontrack handler for incoming media');

    // MENTOR-ONLY: Use alternative media acquisition if needed
    // Some browsers don't fire ontrack reliably for initiators, so we have a fallback
    if (this.userRole === 'mentor') {
      // Monitor connection state for mentor
      const checkMentorReceivers = () => {
        if (peerConnection.connectionState === 'connected' && this.onRemoteStream) {
          const receivers = peerConnection.getReceivers();
          const videoReceiver = receivers.find(r => r.track?.kind === 'video');
          const audioReceiver = receivers.find(r => r.track?.kind === 'audio');
          
          if ((videoReceiver?.track || audioReceiver?.track) && !this.mentorStreamCreated?.has(peerId)) {
            console.log('⏱️ [MENTOR-MEDIA] Mentor detected - checking for remote media streams...');
            
            const tracks: MediaStreamTrack[] = [];
            if (audioReceiver?.track && audioReceiver.track.readyState === 'live') {
              tracks.push(audioReceiver.track);
            }
            if (videoReceiver?.track && videoReceiver.track.readyState === 'live') {
              tracks.push(videoReceiver.track);
            }
            
            if (tracks.length > 0) {
              const mentorStream = new MediaStream(tracks);
              console.log('🎯 [MENTOR-MEDIA] Found live tracks, creating mentor stream with', tracks.length, 'tracks');
              
              // Mark as created to avoid duplicates
              if (!this.mentorStreamCreated) {
                this.mentorStreamCreated = new Map();
              }
              this.mentorStreamCreated.set(peerId, true);
              
              try {
                this.onRemoteStream(mentorStream, peerId);
                console.log('✅ [MENTOR-MEDIA] Mentor stream created and assigned');
              } catch (err) {
                console.error('❌ [MENTOR-MEDIA] Error calling onRemoteStream:', err);
              }
              
              // Stop checking after successful creation
              return true;
            }
          }
        }
        return false;
      };
      
      // Check immediately when connection becomes connected
      const onConnectionReady = () => {
        if (peerConnection.connectionState === 'connected') {
          peerConnection.onconnectionstatechange = null; // Remove listener
          
          // Wait a brief moment for receivers to populate
          setTimeout(() => {
            if (!checkMentorReceivers()) {
              // If check failed, try again after a longer delay
              setTimeout(() => checkMentorReceivers(), 1000);
            }
          }, 100);
        }
      };
      
      // Intercept connection state change to trigger check
      const originalConnectionStateHandler = peerConnection.onconnectionstatechange;
      peerConnection.onconnectionstatechange = () => {
        if (originalConnectionStateHandler) {
          originalConnectionStateHandler.call(peerConnection, new Event('connectionstatechange'));
        }
        onConnectionReady();
      };
    }

    this.peerConnections.set(peerId, peerConnection);
    return peerConnection;
  }

  private closePeerConnection(peerId: string) {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
      console.log('Peer connection closed:', peerId);
    }
  }

  closeAllConnections() {
    for (const [peerId, peerConnection] of this.peerConnections) {
      peerConnection.close();
    }
    this.peerConnections.clear();
    this.stopLocalVideo();
    this.stopScreenShare();
    console.log('All WebRTC connections closed');
  }

  // Getters for UI
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  setScreenStream(stream: MediaStream) {
    this.screenStream = stream;
    console.log('✅ External screen stream set for WebRTC');
  }

  setUserRole(role: 'mentor' | 'student') {
    this.userRole = role;
    console.log('👤 User role set to:', role);
  }

  isScreenSharing(): boolean {
    return this.screenStream !== null;
  }

  // Callback setters
  setOnLocalStream(callback: (stream: MediaStream) => void) {
    this.onLocalStream = callback;
  }

  setOnRemoteStream(callback: (stream: MediaStream, peerId: string) => void) {
    console.log('🔔 [CALLBACK SET] setOnRemoteStream called');
    console.log('📋 Callback type:', typeof callback);
    console.log('📋 Callback function:', callback.toString().substring(0, 200) + '...');
    this.onRemoteStream = callback;
    console.log('✅ [CALLBACK SET] onRemoteStream callback now assigned');
    console.log('🔍 [CALLBACK SET] Verification - this.onRemoteStream is now:', !!this.onRemoteStream);
    
    // Log that this callback will be used when ontrack fires
    console.log('💾 [CALLBACK SET] This callback will be invoked when regular video tracks arrive via ontrack event');
  }

  setOnScreenShare(callback: (stream: MediaStream, peerId: string) => void) {
    console.log('🔔 [CALLBACK SET] setOnScreenShare called');
    this.onScreenShare = callback;
    console.log('✅ [CALLBACK SET] onScreenShare callback now assigned:', !!this.onScreenShare);
    console.log('💾 [CALLBACK SET] This callback will be invoked when screen-share video tracks arrive via ontrack event');
  }

  setOnStreamEnded(callback: (peerId: string) => void) {
    this.onStreamEnded = callback;
  }

  async initiateConnection(remoteUserId: string): Promise<void> {
    try {
      // Prevent duplicate initiation calls
      if (this.initiateConnectionInProgress) {
        console.warn('⚠️ initiateConnection already in progress, skipping...');
        return;
      }
      this.initiateConnectionInProgress = true;

      console.log(`🔗 Starting WebRTC connection initiation...\n`);
      console.log(`📊 Initiator userId: ${this.userId}`);
      console.log(`📊 Remote userId: ${remoteUserId}`);
      console.log(`📊 Session ID: ${this.sessionId}`);
      console.log(`📊 Local stream exists: ${!!this.localStream}`);
      console.log(`📊 Socket connected: ${socketService.isConnected()}`);
      console.log(`📊 User role: ${this.userRole}\n`);

      if (!this.localStream) {
        throw new Error('Local stream not initialized. Call startLocalVideo first.');
      }

      if (!this.sessionId || !this.userId) {
        throw new Error('Session ID or User ID not set');
      }

      // Store remoteUserId for later matching
      this.remoteUserId = remoteUserId;

      // Only mentors should initiate connections
      const shouldOffer = this.userRole === 'mentor';
      
      console.log(`🤝 Should offer: ${shouldOffer} (role: ${this.userRole})\n`);

      if (!shouldOffer) {
        console.log('⏳ Student waiting for offer from mentor...');
        this.initiateConnectionInProgress = false;
        return; // Wait for remote peer to send offer
      }

      // Ensure socket is connected before proceeding
      if (!socketService.isConnected()) {
        console.warn('⚠️ Socket not connected yet, waiting for connection...');
        try {
          await socketService.waitForConnection(15000); // Wait max 15 seconds
          console.log('✅ Socket connected, proceeding with offer\n');
        } catch (err) {
          throw new Error('Socket connection timeout: unable to establish connection');
        }
      }

      // Check if we already have a connection for this remote user
      if (this.peerConnections.has(remoteUserId)) {
        console.warn(`⚠️ Peer connection already exists for ${remoteUserId}, skipping`);
        this.initiateConnectionInProgress = false;
        return;
      }

      // Create peer connection with proper key
      console.log(`🔌 Creating peer connection with KEY: ${remoteUserId}\n`);
      const peerConnection = this.createPeerConnection(remoteUserId);
      console.log(`✅ Peer connection created\n`);

      // Log connection setup
      console.log('📊 Peer connection details after creation:', {
        signalingState: peerConnection.signalingState,
        iceConnectionState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState,
        senders: peerConnection.getSenders().length,
        receivers: peerConnection.getReceivers().length,
      });

      // Create and send offer
      console.log('📤 Creating WebRTC offer with receive audio + video...');
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);
      console.log('✅ Local description set (offer)\n');

      // Log offer before sending
      console.log('📊 Offer SDP (first 200 chars):', offer.sdp?.substring(0, 200));

      // Send offer via socket with proper user IDs
      socketService.emit('video:offer', {
        sessionId: this.sessionId,
        callerId: this.userId,          // Mentor's user ID
        targetId: remoteUserId,         // Student's user ID
        peerId: this.userId,            // Backward compatibility
        offer,
      } as any);
      
      console.log('📤 WebRTC offer sent\n');
      console.log('📊 Offer data:', {
        sessionId: this.sessionId,
        callerId: this.userId,
        targetId: remoteUserId,
        offerType: offer.type,
      });

      this.initiateConnectionInProgress = false;
      console.log('✅ WebRTC connection initiation completed\n');
    } catch (err: any) {
      console.error('❌ Error initiating WebRTC connection:', err);
      this.initiateConnectionInProgress = false;
      throw err;
    }
  }

  hasPeerConnection(peerId: string): boolean {
    return this.peerConnections.has(peerId);
  }

  async handleConnectionRequest(data: any) {
    try {
      const { userId, targetUserId } = data;
      console.log('🔄 Connection request received from:', userId);
      
      // Only mentors should respond to connection requests
      if (this.userId === targetUserId) {
        console.log('🎓 Mentor responding to connection request...');
        await this.initiateConnection(userId);
      }
    } catch (error) {
      console.error('❌ Error handling connection request:', error);
    }
  }
}

// Singleton instance
export const webrtcService = new WebRTCService();
