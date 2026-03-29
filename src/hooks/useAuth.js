import { useState, useEffect, useCallback } from 'react';
import { ipc } from '@/utils/ipc';

export function useAuth(api, isConnected) {
  const [isVerified, setIsVerified] = useState(false);
  const [pinExists, setPinExists] = useState(null);
  const [appLockEnabled, setAppLockEnabled] = useState(() => localStorage.getItem('disbox_app_lock_enabled') === 'true');
  const [appLockPin, setAppLockPin] = useState(() => localStorage.getItem('disbox_app_lock_pin') || '');
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);

  useEffect(() => { localStorage.setItem('disbox_app_lock_enabled', appLockEnabled.toString()); }, [appLockEnabled]);
  useEffect(() => { localStorage.setItem('disbox_app_lock_pin', appLockPin); }, [appLockPin]);

  const verifyPin = useCallback(async (pin) => {
    if (!api) return false;
    const ok = await ipc.verifyPin(api.hashedWebhook, pin);
    if (ok) setIsVerified(true);
    return ok;
  }, [api]);

  const setPin = useCallback(async (pin) => {
    if (!api) return false;
    return await ipc.setPin(api.hashedWebhook, pin);
  }, [api]);

  const hasPin = useCallback(async () => {
    if (!api) return false;
    const exists = await ipc.hasPin(api.hashedWebhook);
    setPinExists(exists);
    return exists;
  }, [api]);

  useEffect(() => { if (isConnected) hasPin(); }, [isConnected, hasPin]);
  useEffect(() => {
    if (!isConnected || !api) return;
    const interval = setInterval(() => { hasPin(); }, 10000);
    return () => clearInterval(interval);
  }, [isConnected, api, hasPin]);

  const removePin = useCallback(async (pin) => {
    if (!api) return false;
    const ok = await ipc.verifyPin(api.hashedWebhook, pin);
    if (ok) { await ipc.removePin(api.hashedWebhook); setIsVerified(false); return true; }
    return false;
  }, [api]);

  return { isVerified, setIsVerified, pinExists, setPinExists, appLockEnabled, setAppLockEnabled, appLockPin, setAppLockPin, isAppUnlocked, setIsAppUnlocked, verifyPin, setPin, hasPin, removePin };
}