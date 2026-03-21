'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/services/api';
import { useAuthStore } from '@/store';
import { VideoConferenceWrapper } from '@/components/VideoConferenceWrapper';
import { GlowingButton, LoadingSpinner } from '@/components/ui/GlowingComponents';

export default function VideoConferenceLinkPage() {
  const params = useParams();
  const router = useRouter();
  const linkToken = params.linkToken as string;
  const { user } = useAuthStore();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      // Redirect to login if not authenticated
      router.push('/login');
      return;
    }

    const verifyLink = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔗 Verifying video link:', linkToken);

        // Verify the link and get session details
        const response = await apiClient.post(`/api/sessions/verify-link/${linkToken}`, {});
        
        if (!response?.data?.sessionId) {
          throw new Error('Invalid link or session not found');
        }

        console.log('✅ Link verified, session:', response.data.sessionId);
        setSessionId(response.data.sessionId);
        setIsConnected(true);
      } catch (err: any) {
        const errorMessage = err?.response?.data?.error || err?.message || 'Failed to verify video link';
        console.error('❌ Error verifying link:', errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    verifyLink();
  }, [linkToken, user, router]);

  if (!user) {
    return null; // Will redirect to login
  }

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
        <div className="text-center">
          <LoadingSpinner />
          <p className="text-white mt-4">Loading video conference...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-xl mb-4">❌ {error}</p>
          <p className="text-gray-400 mb-6">The video link has expired or is invalid.</p>
          <GlowingButton 
            variant="primary"
            onClick={() => router.push('/dashboard')}
          >
            Back to Dashboard
          </GlowingButton>
        </div>
      </div>
    );
  }

  if (!isConnected || !sessionId) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
        <div className="text-center">
          <p className="text-gray-400">Unable to connect to video conference</p>
        </div>
      </div>
    );
  }

  // Render video conference with session
  return (
    <div className="w-full h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
      <VideoConferenceWrapper
        sessionId={sessionId}
        accessedViaLink={true}
        onClose={() => router.push('/dashboard')}
      />
    </div>
  );
}
