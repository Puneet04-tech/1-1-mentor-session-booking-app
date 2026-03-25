import { socketService } from './socket';

interface RTCConfig {
  iceServers: RTCIceServer[];
}

export class WebRTCService {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
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

      console.log(`🎥 Starting local video - Session: ${sessionId}, User: ${userId}`);

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

  async startScreenShare(sessionId: string, userId: string): Promise<MediaStream> {
    try {
      console.log('🖥️ WebRTCService.startScreenShare called', { sessionId, userId });
      
      if (!this.localStream) {
        console.error('❌ Local stream not initialized. Call startLocalVideo first.');
        throw new Error('Local stream not initialized. Call startLocalVideo first.');
      }

      if (!this.sessionId || !this.userId) {
        console.error('❌ Session ID or User ID not set');
        throw new Error('Session ID or User ID not set');
      }

      console.log(`🖥️ Starting WebRTC screen share - Session: ${sessionId}, User: ${userId}`);

      // Simple constraints without timeout
      const constraints: DisplayMediaStreamOptions = {
        audio: false,
        video: true,
      };

      console.log('🎬 Getting display media with constraints:', constraints);
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('✅ Screen share stream obtained:', this.screenStream);

      // Replace video track in peer connections
      const videoTrack = this.screenStream.getVideoTracks()[0];
      console.log('📹 Screen share video track:', videoTrack);
      console.log('📊 Current peer connections:', Array.from(this.peerConnections.keys()));
      
      for (const [peerId, peerConnection] of this.peerConnections) {
        console.log(`🔄 Processing peer connection: ${peerId}`);
        const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
          console.log(`📹 Replaced video track with screen share for peer: ${peerId}`);
        }
      }

      // Listen for screen share stop
      videoTrack.onended = () => {
        console.log('Screen share ended');
        this.stopScreenShare();
      };

      // Notify peers
      console.log('🔍 About to emit screen:started with:', {
        sessionId: this.sessionId,
        userId: this.userId,
      });
      
      socketService.emit('screen:started', {
        sessionId: this.sessionId,
        userId: this.userId,
      } as any);

      console.log('Screen sharing started');
      return this.screenStream;
    } catch (err: any) {
      console.error('Screen share error:', err);
      
      if (err.name === 'NotAllowedError') {
        throw new Error('Screen share permission denied. Please allow screen sharing in your browser.');
      } else if (err.name === 'AbortError' && err.message?.includes('Timeout')) {
        throw new Error('Screen share timed out. Please try again and ensure your browser allows screen sharing.');
      } else if (err.name === 'AbortError') {
        throw new Error('Screen share was cancelled or failed to start. Please try again.');
      } else {
        throw new Error(`Screen share failed: ${err.message || 'Unknown error'}`);
      }
    }
  }

  async stopScreenShare() {
    try {
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => track.stop());
        this.screenStream = null;

        // Restore local video track
        if (this.localStream) {
          const videoTrack = this.localStream.getVideoTracks()[0];
          for (const [peerId, peerConnection] of this.peerConnections) {
            const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video');
            if (sender && videoTrack) {
              await sender.replaceTrack(videoTrack);
            }
          }
        }

        // Notify peers
        socketService.emit('screen:stopped', {
          sessionId: this.sessionId,
          userId: this.userId,
        } as any);

        console.log('Screen sharing stopped');
      }
    } catch (err) {
      console.error('Error stopping screen share:', err);
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
      const actualPeerId = callerId || peerId || 'unknown-peer';
      console.log(`🔌 Will use peer connection key: ${actualPeerId}`);
      
      // Check if we already have a peer connection for this peer
      let peerConnection = this.peerConnections.get(actualPeerId);
      
      if (peerConnection) {
        // Already have a connection - check its state
        const signalingState = peerConnection.signalingState;
        console.log(`📊 Existing peer connection found with key ${actualPeerId}, state: ${signalingState}`);
        
        if (signalingState !== 'stable') {
          console.warn(`⚠️ Ignoring offer - peer connection already in state: ${signalingState}`);
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
      console.log('📊 Peer connection after creating answer:', {
        signalingState: peerConnection.signalingState,
        localTracks: peerConnection.getSenders().length,
        remoteTracks: peerConnection.getReceivers().length,
      });

      // Send answer with user IDs so remote can match
      socketService.emit('video:answer', {
        sessionId: this.sessionId,
        callerId: this.userId,        // My user ID (answer sender)
        targetId: actualPeerId,       // Offer sender's user ID
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
      const { answer, callerId, targetId, peerId } = data;
      console.log('📨 Received video answer', {
        callerId,
        targetId,
        peerId,
        hasAnswer: !!answer,
        currentRemoteUserId: this.remoteUserId,
      });
      console.log('📊 Current peer connections:', Array.from(this.peerConnections.keys()));
      
      // The answer is coming from a peer. Use callerId as the primary key (sender's user ID)
      // This should match the peer connection we created in initiateConnection
      const actualPeerId = callerId || targetId || peerId || this.remoteUserId;
      
      if (!actualPeerId) {
        console.warn('⚠️ Could not determine peer ID for answer');
        return;
      }
      
      console.log('🔍 Looking for peer connection with key:', actualPeerId);
      let peerConnection = this.peerConnections.get(actualPeerId);
      
      if (!peerConnection) {
        console.warn('⚠️ Peer connection NOT found with key:', actualPeerId);
        console.log('📋 Available keys:', Array.from(this.peerConnections.keys()));
        
        // If not found by userId, try 'initiator' as last resort for backwards compatibility
        const initiatorPC = this.peerConnections.get('initiator');
        if (initiatorPC) {
          console.log('🔄 Using initiator PC for answer');
          peerConnection = initiatorPC;
        }
      } else {
        console.log('✅ Found peer connection with key:', actualPeerId);
      }
      
      if (peerConnection) {
        // Check connection state before setting remote description
        const signalingState = peerConnection.signalingState;
        console.log(`📊 Peer connection signaling state: ${signalingState}`);
        console.log('📊 Peer connection details:', {
          signalingState,
          iceConnectionState: peerConnection.iceConnectionState,
          connectionState: peerConnection.connectionState,
          senders: peerConnection.getSenders().length,
          receivers: peerConnection.getReceivers().length,
        });
        
        // Only set remote description if we're in a state where we can
        if (signalingState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('✅ Set remote description (answer)');
          console.log('📊 After setting remote answer:', {
            signalingState: peerConnection.signalingState,
            iceConnectionState: peerConnection.iceConnectionState,
          });
        } else {
          console.warn(`⚠️ Cannot set remote answer - wrong state: ${signalingState}. Expected 'have-local-offer'`);
        }
      } else {
        console.warn('⚠️ No peer connection found for answer after all attempts');
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
        console.warn('⚠️ Could not determine peer ID for ICE candidate');
        return;
      }
      
      let peerConnection = this.peerConnections.get(actualPeerId);
      
      // If peer connection doesn't exist yet, try other keys
      if (!peerConnection) {
        const initiatorPC = this.peerConnections.get('initiator');
        if (initiatorPC) {
          console.log('🔄 Using initiator PC for ICE candidate');
          peerConnection = initiatorPC;
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
      
      // Create peer connection for screen share if not exists
      let peerConnection = this.peerConnections.get(`screen:${peerId}`);
      if (!peerConnection) {
        peerConnection = this.createPeerConnection(`screen:${peerId}`);
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
      
      // TODO: Handle remote screen share started
      // This would typically trigger UI updates or create a new peer connection for screen share
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

    // Add local stream tracks
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      console.log(`📋 Adding ${tracks.length} tracks to peer connection`);
      
      tracks.forEach((track) => {
        try {
          peerConnection.addTrack(track, this.localStream!);
          console.log(`✅ Added ${track.kind} track to peer connection (enabled: ${track.enabled})`);
        } catch (err) {
          console.error(`❌ Error adding ${track.kind} track:`, err);
        }
      });
    } else {
      console.warn('⚠️  No local stream available when creating peer connection!');
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
        socketService.emit('video:ice-candidate', {
          sessionId: this.sessionId,
          peerId: this.userId,
          callerId: this.userId,
          candidate: event.candidate,
        } as any);
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('✅✅✅ ONTRACK FIRED! ✅✅✅');
      console.log('📹 Received remote track:', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        streamCount: event.streams.length,
        trackLabel: event.track?.label,
        trackId: event.track?.id,
      });
      
      if (event.streams && event.streams.length > 0) {
        console.log(`✅ Remote stream has ${event.streams[0].getTracks().length} tracks`);
        console.log('🔍 Stream tracks details:', event.streams[0].getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          id: t.id
        })));
        
        // Check if this is a screen share track (usually has specific characteristics)
        const tracks = event.streams[0].getTracks();
        const videoTrack = tracks.find(t => t.kind === 'video');
        
        // Better screen share detection - check track settings and properties
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
          trackSettings: (videoTrack as any)?.settings,
          trackKind: videoTrack?.kind,
        });
        
        if (isScreenShareTrack && this.onScreenShare) {
          console.log('🖥️ Detected screen share track, calling onScreenShare callback');
          this.onScreenShare(event.streams[0], peerId);
        } else if (this.onRemoteStream) {
          console.log('📹 Detected regular video track, calling onRemoteStream callback');
          console.log('🔍 Callback function exists:', !!this.onRemoteStream);
          console.log('🔍 Stream to pass:', event.streams[0]);
          this.onRemoteStream(event.streams[0], peerId);
          console.log('✅ onRemoteStream callback called');
        } else {
          console.error('❌ NO CALLBACK SET! this.onRemoteStream is:', this.onRemoteStream);
        }
      } else {
        console.warn('⚠️ Remote track received but no streams array');
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔄 Connection state with ${peerId}: ${peerConnection.connectionState}`);
      console.log(`📊 Peer connection stats:`, {
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        signalingState: peerConnection.signalingState,
        localTracks: peerConnection.getSenders().length,
        remoteTracks: peerConnection.getReceivers().length,
      });
      
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        this.closePeerConnection(peerId);
      }
    };

    // Log ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);
      
      if (peerConnection.iceConnectionState === 'failed') {
        console.warn('⚠️ ICE connection failed - may need TURN server or network fix');
      } else if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
        console.log('✅ ICE connection established');
      }
    };

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
    console.log('🔔 [CALLBACK SET] setOnRemoteStream called with callback:', typeof callback);
    this.onRemoteStream = callback;
    console.log('✅ [CALLBACK SET] onRemoteStream callback now set:', !!this.onRemoteStream);
  }

  setOnScreenShare(callback: (stream: MediaStream, peerId: string) => void) {
    this.onScreenShare = callback;
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

      console.log(`🔗 Starting WebRTC connection initiation...`);
      console.log(`📊 Initiator userId: ${this.userId}`);
      console.log(`📊 Remote userId: ${remoteUserId}`);
      console.log(`📊 Session ID: ${this.sessionId}`);
      console.log(`📊 Local stream exists: ${!!this.localStream}`);
      console.log(`📊 Socket connected: ${socketService.isConnected()}`);

      if (!this.localStream) {
        throw new Error('Local stream not initialized. Call startLocalVideo first.');
      }

      if (!this.sessionId || !this.userId) {
        throw new Error('Session ID or User ID not set');
      }

      // Store remoteUserId for later matching
      this.remoteUserId = remoteUserId;

      // Only mentors should initiate connections to avoid race conditions
      // Students wait for mentor offers
      const shouldOffer = this.userRole === 'mentor';
      
      console.log(`🤝 Should offer: ${shouldOffer} (role: ${this.userRole}, userId: ${this.userId})`);

      if (!shouldOffer) {
        console.log('⏳ Waiting for offer from remote peer (higher ID)...');
        this.initiateConnectionInProgress = false;
        return; // Wait for remote peer to send offer
      }

      // Check if socket is connected before proceeding
      if (!socketService.isConnected()) {
        console.warn('⚠️ Socket not connected! Waiting...');
        // Retry waiting for socket connection
        let retries = 0;
        while (retries < 20 && !socketService.isConnected()) {
          await new Promise(resolve => setTimeout(resolve, 250));
          retries++;
        }
        
        if (!socketService.isConnected()) {
          throw new Error('Socket connection failed after 5 seconds');
        }
        console.log('✅ Socket connected after retry');
      }

      // Check if we already have a connection for this remote user
      if (this.peerConnections.has(remoteUserId)) {
        console.warn(`⚠️ Peer connection already exists for ${remoteUserId}, skipping initialization`);
        this.initiateConnectionInProgress = false;
        return;
      }

      // Create a peer connection with remoteUserId as the key
      console.log(`🔌 Creating peer connection with KEY: ${remoteUserId}`);
      const peerConnection = this.createPeerConnection(remoteUserId);
      console.log(`✅ Peer connection created and stored with key: ${remoteUserId}`);

      // Create and send offer
      console.log('📤 Creating WebRTC offer...');
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);
      console.log('✅ Local description set (offer)');

      // Send offer via socket with user IDs (not socket IDs)
      socketService.emit('video:offer', {
        sessionId: this.sessionId,
        callerId: this.userId,          // Mentor's user ID
        targetId: remoteUserId,         // Student's user ID
        peerId: this.userId,            // Also send as peerId for backward compat
        offer,
      } as any);
      
      console.log('📤 WebRTC offer sent to remote user');
      console.log('📊 Offer data sent:', {
        sessionId: this.sessionId,
        callerId: this.userId,
        targetId: remoteUserId,
        peerId: this.userId,
        offerType: offer.type,
      });

      this.initiateConnectionInProgress = false;
      console.log('✅ WebRTC connection initiation completed');
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
