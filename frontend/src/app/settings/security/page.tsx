'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/api';
import {
  GlowingButton,
  GlowingInput,
  GlowingCard,
  GradientText,
  LoadingSpinner,
  Badge,
} from '@/components/ui/GlowingComponents';

type SetupData = { secret: string; otpauthUrl: string; qrCode: string };

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Enable flow
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Disable flow
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get2FAStatus();
      setEnabled(!!res.data?.enabled);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load 2FA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const startSetup = async () => {
    clearMessages();
    setBusy(true);
    try {
      const res = await apiClient.setup2FA();
      if (res.data) setSetup(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start setup');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!enableCode.trim()) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.enable2FA(enableCode.trim());
      setBackupCodes(res.data?.backupCodes || []);
      setSetup(null);
      setEnableCode('');
      setEnabled(true);
      setSuccess('Two-factor authentication is now enabled.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!disablePassword || !disableCode.trim()) {
      setError('Both your password and a current 2FA code are required');
      return;
    }
    setBusy(true);
    try {
      await apiClient.disable2FA(disablePassword, { token: disableCode.trim() });
      setEnabled(false);
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      setBackupCodes(null);
      setSuccess('Two-factor authentication has been disabled.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disable 2FA');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            <GradientText>Security</GradientText>
          </h1>
          <Link
            href="/profile"
            className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            ← Back to profile
          </Link>
        </div>

        {(error || success) && (
          <div
            className={`p-4 rounded-lg text-sm border ${
              error
                ? 'bg-red-900/20 border-red-700/50 text-red-300'
                : 'bg-green-900/20 border-green-700/50 text-green-300'
            }`}
          >
            {error || success}
          </div>
        )}

        <GlowingCard glow="blue" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Two-Factor Authentication (2FA)
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add an extra layer of security using an authenticator app.
              </p>
            </div>
            <Badge color={enabled ? 'green' : 'purple'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          {/* One-time backup codes display after enabling */}
          {backupCodes && (
            <div className="p-4 bg-yellow-900/10 border border-yellow-700/40 rounded-lg">
              <p className="text-sm font-semibold text-yellow-300 mb-2">
                Save these backup codes now — they will not be shown again.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-gray-800 dark:text-gray-200">
                {backupCodes.map((code) => (
                  <span key={code} className="px-2 py-1 bg-white/50 dark:bg-dark-800/60 rounded">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Disabled → show enable flow */}
          {!enabled && !setup && (
            <GlowingButton variant="primary" onClick={startSetup} disabled={busy}>
              {busy ? <LoadingSpinner /> : 'Enable 2FA'}
            </GlowingButton>
          )}

          {!enabled && setup && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, …),
                then enter the 6-digit code to finish enabling 2FA.
              </p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qrCode} alt="2FA QR code" width={200} height={200} />
              </div>
              <p className="text-xs text-center text-gray-500 break-all">
                Can&apos;t scan? Manual key: <span className="font-mono">{setup.secret}</span>
              </p>
              <form onSubmit={confirmEnable} className="space-y-3">
                <GlowingInput
                  label="Verification code"
                  value={enableCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnableCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                />
                <div className="flex gap-3">
                  <GlowingButton variant="primary" type="submit" disabled={busy}>
                    {busy ? <LoadingSpinner /> : 'Verify & Enable'}
                  </GlowingButton>
                  <GlowingButton variant="secondary" type="button" onClick={() => setSetup(null)}>
                    Cancel
                  </GlowingButton>
                </div>
              </form>
            </div>
          )}

          {/* Enabled → show disable flow */}
          {enabled && !showDisable && (
            <GlowingButton variant="secondary" onClick={() => setShowDisable(true)}>
              Disable 2FA
            </GlowingButton>
          )}

          {enabled && showDisable && (
            <form onSubmit={confirmDisable} className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Confirm your password and a current authenticator code to disable 2FA.
              </p>
              <GlowingInput
                label="Password"
                type="password"
                value={disablePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisablePassword(e.target.value)}
                placeholder="••••••••"
              />
              <GlowingInput
                label="Authenticator code"
                value={disableCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisableCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
              <div className="flex gap-3">
                <GlowingButton variant="outline" type="submit" disabled={busy}>
                  {busy ? <LoadingSpinner /> : 'Disable 2FA'}
                </GlowingButton>
                <GlowingButton
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setShowDisable(false);
                    clearMessages();
                  }}
                >
                  Cancel
                </GlowingButton>
              </div>
            </form>
          )}
        </GlowingCard>
      </div>
    </div>
  );
}
