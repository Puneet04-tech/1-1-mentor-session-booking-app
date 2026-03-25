// WebRTC Debugging Utility for diagnosing video display issues

export interface DebugInfo {
  timestamp: string;
  remoteVideoRefExists: boolean;
  remoteVideoRefCurrent: boolean;
  srcObjectExists: boolean;
  srcObjectType: string;
  srcObjectTracks: number;
  videoElementMounted: boolean;
  videoElementProperties: {
    clientWidth: number;
    clientHeight: number;
    offsetWidth: number;
    offsetHeight: number;
    display: string;
    visibility: string;
    opacity: string;
  };
  autoplayProperty: boolean;
  playsinlineProperty: boolean;
  pausedState: boolean;
  volumeLevel: number;
  mutedState: boolean;
  networkState: number; // 0=empty, 1=idle, 2=loading, 3=currentdata
  readyState: number;    // 0=nothing, 1=metadata, 2=currentdata, 3=futuredata, 4=enoughdata
  browserPolicies: {
    autoplayAllowed: string;
    unmutedAutoplayAllowed: string;
  };
  consoleErrors: string[];
}

export class WebRTCDebugger {
  private remoteVideoRef: React.RefObject<HTMLVideoElement>;
  private consoleErrors: string[] = [];
  private originalError: typeof console.error = console.error;

  constructor(remoteVideoRef: React.RefObject<HTMLVideoElement>) {
    this.remoteVideoRef = remoteVideoRef;
    this.setupErrorCapture();
  }

  private setupErrorCapture() {
    // Capture console errors related to video
    this.originalError = console.error;
    console.error = (...args: any[]) => {
      const errorStr = args.map(a => String(a)).join(' ');
      if (errorStr.includes('video') || errorStr.includes('media') || errorStr.includes('play')) {
        this.consoleErrors.push(errorStr);
      }
      this.originalError.apply(console, args);
    };
  }

  /** 📊 Debug Issue #1: Check if remoteVideoRef exists in the DOM */
  public checkDOMReference(): { exists: boolean; details: string } {
    const videoElement = this.remoteVideoRef.current;
    const inDOM = videoElement ? document.body.contains(videoElement) : false;
    
    if (!videoElement) {
      console.error('❌ [DEBUG] remoteVideoRef.current is NULL - video element doesn\'t exist at all!');
      return {
        exists: false,
        details: 'Video element ref is NULL. Check if video element is rendered.'
      };
    }

    if (!inDOM) {
      console.error('❌ [DEBUG] remoteVideoRef.current exists but is NOT in DOM - orphaned element!');
      return {
        exists: false,
        details: 'Video element exists but not mounted in DOM. Check render conditions.'
      };
    }

    console.log('✅ [DEBUG] remoteVideoRef.current exists and IS in DOM');
    return {
      exists: true,
      details: 'Video element is properly mounted in DOM'
    };
  }

  /** 📊 Debug Issue #2: Verify stream is assigned to the video element */
  public checkStreamAssignment(): {
    hasStream: boolean;
    trackCount: number;
    details: string;
  } {
    const videoElement = this.remoteVideoRef.current;
    if (!videoElement) {
      console.error('❌ [DEBUG] Cannot check stream - video element is NULL');
      return {
        hasStream: false,
        trackCount: 0,
        details: 'Video element not found'
      };
    }

    const srcObject = videoElement.srcObject as MediaStream | null;
    
    if (!srcObject) {
      console.error('❌ [DEBUG] srcObject is NULL - no stream assigned to video element!');
      return {
        hasStream: false,
        trackCount: 0,
        details: 'No MediaStream assigned to video element (srcObject is null)'
      };
    }

    if (!(srcObject instanceof MediaStream)) {
      console.error('❌ [DEBUG] srcObject is NOT a MediaStream:', typeof srcObject);
      return {
        hasStream: false,
        trackCount: 0,
        details: `srcObject is wrong type: ${typeof srcObject}`
      };
    }

    const tracks = srcObject.getTracks();
    const videoTracks = srcObject.getVideoTracks();
    const audioTracks = srcObject.getAudioTracks();

    console.log('✅ [DEBUG] Stream assigned to video element:', {
      totalTracks: tracks.length,
      videoTracks: videoTracks.length,
      audioTracks: audioTracks.length,
      trackDetails: tracks.map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        id: t.id,
        label: t.label,
        readyState: t.readyState
      }))
    });

    if (videoTracks.length === 0) {
      console.warn('⚠️ [DEBUG] Stream has NO VIDEO TRACKS - only audio!');
      return {
        hasStream: true,
        trackCount: tracks.length,
        details: `Stream assigned but has NO VIDEO TRACKS (audio: ${audioTracks.length})`
      };
    }

    if (videoTracks.some(t => !t.enabled)) {
      console.warn('⚠️ [DEBUG] Some video tracks are DISABLED');
    }

    if (videoTracks.some(t => t.readyState !== 'live')) {
      console.warn('⚠️ [DEBUG] Some video tracks are NOT LIVE:', 
        videoTracks.map(t => ({ enabled: t.enabled, readyState: t.readyState }))
      );
    }

    return {
      hasStream: true,
      trackCount: tracks.length,
      details: `Stream assigned with ${videoTracks.length} video + ${audioTracks.length} audio tracks`
    };
  }

  /** 📊 Debug Issue #3: Test browser autoplay/unmuted policies */
  public checkPlaybackPolicies(): {
    autoplayAllowed: boolean | string;
    unmutedAllowed: boolean | string;
    recommendations: string[];
  } {
    const videoElement = this.remoteVideoRef.current;
    const recommendations: string[] = [];

    if (!videoElement) {
      return {
        autoplayAllowed: 'UNKNOWN - video element not found',
        unmutedAllowed: 'UNKNOWN - video element not found',
        recommendations: ['Create video element first']
      };
    }

    console.log('🔍 [DEBUG] Checking browser autoplay policies...');

    // Check autoplay attribute
    const hasAutoPlay = videoElement.hasAttribute('autoplay');
    console.log(`📋 [DEBUG] autoplay attribute: ${hasAutoPlay}`);

    // Check muted state (required for autoplay without user gesture in most browsers)
    const isMuted = videoElement.muted;
    console.log(`📋 [DEBUG] muted state: ${isMuted}`);

    // Check playsinline attribute (iOS requirement)
    const hasPlaysinline = videoElement.hasAttribute('playsinline');
    const hasWebkitPlaysinline = videoElement.hasAttribute('webkit-playsinline');
    console.log(`📋 [DEBUG] playsinline: ${hasPlaysinline}, webkit-playsinline: ${hasWebkitPlaysinline}`);

    // Check video visibility
    const styles = window.getComputedStyle(videoElement);
    const isVisible = styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0';
    console.log(`📋 [DEBUG] Video is visible: ${isVisible} (display: ${styles.display}, visibility: ${styles.visibility}, opacity: ${styles.opacity})`);

    // Check if video element has dimensions
    const hasDimensions = videoElement.clientWidth > 0 && videoElement.clientHeight > 0;
    console.log(`📋 [DEBUG] Video element dimensions: ${videoElement.clientWidth}x${videoElement.clientHeight}`);

    // Check paused state
    const isPaused = videoElement.paused;
    console.log(`📋 [DEBUG] Video paused state: ${isPaused}`);

    // Check volume
    console.log(`📋 [DEBUG] Video volume: ${videoElement.volume}`);

    // Browser-specific checks
    const userAgent = navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent) && !/Chromium/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);

    let autoplayAllowed: boolean | string = true;
    let unmutedAllowed: boolean | string = true;

    // Chrome: Autoplay with sound for muted videos or user gesture
    if (isChrome) {
      autoplayAllowed = true; // Muted videos can autoplay
      unmutedAllowed = 'REQUIRES_USER_GESTURE'; // Unmuted needs user interaction
      recommendations.push('Chrome: Video should be muted for autoplay (or needs user gesture for unmuted)');
    }

    // Firefox: Similar to Chrome in recent versions
    if (isFirefox) {
      autoplayAllowed = true;
      unmutedAllowed = 'REQUIRES_USER_GESTURE';
      recommendations.push('Firefox: Video should be muted for autoplay');
    }

    // Safari: More restrictive
    if (isSafari) {
      autoplayAllowed = 'RESTRICTED';
      unmutedAllowed = 'REQUIRES_USER_GESTURE';
      recommendations.push('Safari: Video playback is heavily restricted');
      recommendations.push('Safari: Add webkit-playsinline attribute for inline playback');
      recommendations.push('Safari: Consider muting video for autoplay');
    }

    // Recommendations
    if (!hasAutoPlay) {
      recommendations.push('Add autoplay attribute to video element');
    }

    if (!isMuted && !isChrome) {
      recommendations.push('Consider muting video for better autoplay compatibility');
    }

    if (!hasPlaysinline && !hasWebkitPlaysinline) {
      recommendations.push('Add playsinline and webkit-playsinline attributes');
    }

    if (!isVisible) {
      recommendations.push('Video element is not visible - check CSS display/visibility/opacity');
    }

    if (!hasDimensions) {
      recommendations.push('Video element has no dimensions - check width/height styling');
    }

    if (isPaused) {
      recommendations.push('Video is currently paused - call .play() to start playback');
    }

    console.log('🔍 [DEBUG] Policy Check Results:', {
      autoplayAllowed,
      unmutedAllowed,
      recommendations
    });

    return { autoplayAllowed, unmutedAllowed, recommendations };
  }

  /** 🎯 Comprehensive debug snapshot */
  public getDebugSnapshot(): DebugInfo {
    const videoElement = this.remoteVideoRef.current;
    const srcObject = videoElement?.srcObject as MediaStream | null;
    const tracks = srcObject?.getTracks() || [];
    const styles = videoElement ? window.getComputedStyle(videoElement) : ({} as CSSStyleDeclaration);
    const policies = this.checkPlaybackPolicies();

    const info: DebugInfo = {
      timestamp: new Date().toISOString(),
      remoteVideoRefExists: !!videoElement,
      remoteVideoRefCurrent: videoElement ? document.body.contains(videoElement) : false,
      srcObjectExists: !!srcObject,
      srcObjectType: srcObject ? srcObject.constructor.name : 'null',
      srcObjectTracks: tracks.length,
      videoElementMounted: videoElement ? document.body.contains(videoElement) : false,
      videoElementProperties: {
        clientWidth: videoElement?.clientWidth || 0,
        clientHeight: videoElement?.clientHeight || 0,
        offsetWidth: videoElement?.offsetWidth || 0,
        offsetHeight: videoElement?.offsetHeight || 0,
        display: styles.display || 'unknown',
        visibility: styles.visibility || 'unknown',
        opacity: styles.opacity || 'unknown',
      },
      autoplayProperty: videoElement?.autoplay || false,
      playsinlineProperty: videoElement?.hasAttribute('playsinline') || false,
      pausedState: videoElement?.paused || false,
      volumeLevel: videoElement?.volume || 0,
      mutedState: videoElement?.muted || false,
      networkState: videoElement?.networkState || 0,
      readyState: videoElement?.readyState || 0,
      browserPolicies: {
        autoplayAllowed: String(policies.autoplayAllowed),
        unmutedAutoplayAllowed: String(policies.unmutedAllowed),
      },
      consoleErrors: this.consoleErrors.slice(-10), // Last 10 errors
    };

    return info;
  }

  /** 🔧 Force play video with error handling */
  public async forcePlayVideo(): Promise<void> {
    const videoElement = this.remoteVideoRef.current;
    if (!videoElement) {
      console.error('❌ [DEBUG] Cannot play - video element not found');
      return;
    }

    try {
      console.log('🎬 [DEBUG] Attempting to play video...');
      await videoElement.play();
      console.log('✅ [DEBUG] Video play() succeeded');
    } catch (err: any) {
      console.error('❌ [DEBUG] Video play() failed:', err.name, err.message);
      
      // Provide remediation steps
      if (err.name === 'NotAllowedError') {
        console.error('🚫 [DEBUG] NotAllowedError - likely autoplay policy. Try:');
        console.error('   1. Add muted attribute to video');
        console.error('   2. Get user gesture (click) before calling play()');
        console.error('   3. Check browser autoplay settings');
      }
    }
  }

  /** 📱 Mobile-specific debug checks */
  public checkMobileRequirements(): string[] {
    const videoElement = this.remoteVideoRef.current;
    const issues: string[] = [];

    if (!videoElement) return ['Video element not found'];

    const isMobile = /Mobile|Android|iPhone|iPad/.test(navigator.userAgent);
    
    if (isMobile) {
      if (!videoElement.hasAttribute('playsinline')) {
        issues.push('iOS: Missing playsinline attribute');
      }
      if (!videoElement.hasAttribute('webkit-playsinline')) {
        issues.push('iOS: Missing webkit-playsinline attribute');
      }
      if (!videoElement.muted) {
        issues.push('Mobile: Video should be muted for better compatibility');
      }
    }

    return issues;
  }

  /** 🎯 Full diagnostic report */
  public generateReport(): string {
    const domCheck = this.checkDOMReference();
    const streamCheck = this.checkStreamAssignment();
    const policyCheck = this.checkPlaybackPolicies();
    const snapshot = this.getDebugSnapshot();
    const mobileIssues = this.checkMobileRequirements();

    const report = `
╔════════════════════════════════════════════════════════════════╗
║                 WEBRTC VIDEO DEBUG REPORT                      ║
╚════════════════════════════════════════════════════════════════╝

📊 TIME: ${snapshot.timestamp}

┌─ ISSUE #1: DOM Reference ─────────────────────────────────────┐
${domCheck.exists ? '✅' : '❌'} ${domCheck.details}
   - Video Element Mounted: ${snapshot.videoElementMounted}
   - In Document Body: ${document.body.contains(this.remoteVideoRef.current || new HTMLVideoElement())}
   - Dimensions: ${snapshot.videoElementProperties.clientWidth}x${snapshot.videoElementProperties.clientHeight}px

┌─ ISSUE #2: Stream Assignment ─────────────────────────────────┐
${streamCheck.hasStream ? '✅' : '❌'} ${streamCheck.details}
   - Stream Type: ${snapshot.srcObjectType}
   - Total Tracks: ${snapshot.srcObjectTracks}
   - Paused State: ${snapshot.pausedState}
   - Volume: ${snapshot.volumeLevel}
   - Muted: ${snapshot.mutedState}

┌─ ISSUE #3: Playback Policies ─────────────────────────────────┐
   - Autoplay Allowed: ${snapshot.browserPolicies.autoplayAllowed}
   - Unmuted Autoplay: ${snapshot.browserPolicies.unmutedAutoplayAllowed}
   - Has autoplay attr: ${snapshot.autoplayProperty}
   - Has playsinline attr: ${snapshot.playsinlineProperty}
   - Visible: ${snapshot.videoElementProperties.display !== 'none'}

┌─ CSS Styling ──────────────────────────────────────────────────┐
   - Display: ${snapshot.videoElementProperties.display}
   - Visibility: ${snapshot.videoElementProperties.visibility}
   - Opacity: ${snapshot.videoElementProperties.opacity}

┌─ Recommendations ──────────────────────────────────────────────┐
${policyCheck.recommendations.map((r, i) => `   ${i + 1}. ${r}`).join('\n')}

${mobileIssues.length > 0 ? `
┌─ Mobile Issues ────────────────────────────────────────────────┐
${mobileIssues.map((i) => `   ⚠️ ${i}`).join('\n')}
` : ''}

════════════════════════════════════════════════════════════════
    `;

    console.log(report);
    return report;
  }

  public destroy() {
    console.error = this.originalError;
    this.consoleErrors = [];
  }
}

// Export singleton debug function
export function setupVideoDebug(remoteVideoRef: React.RefObject<HTMLVideoElement>) {
  const videoDebugger = new WebRTCDebugger(remoteVideoRef);
  
  // Make it globally accessible for browser console
  (window as any).videoDebug = {
    checkDOM: () => videoDebugger.checkDOMReference(),
    checkStream: () => videoDebugger.checkStreamAssignment(),
    checkPolicy: () => videoDebugger.checkPlaybackPolicies(),
    snapshot: () => videoDebugger.getDebugSnapshot(),
    play: () => videoDebugger.forcePlayVideo(),
    mobile: () => videoDebugger.checkMobileRequirements(),
    report: () => videoDebugger.generateReport(),
  };

  console.log('🎥 Video Debug utilities available globally:');
  console.log('   window.videoDebug.checkDOM()     - Check if video element is in DOM');
  console.log('   window.videoDebug.checkStream()  - Check if stream is assigned');
  console.log('   window.videoDebug.checkPolicy()  - Check browser policies');
  console.log('   window.videoDebug.snapshot()     - Get full debug snapshot');
  console.log('   window.videoDebug.play()         - Force play video');
  console.log('   window.videoDebug.mobile()       - Check mobile requirements');
  console.log('   window.videoDebug.report()       - Generate full report');

  return videoDebugger;
}
