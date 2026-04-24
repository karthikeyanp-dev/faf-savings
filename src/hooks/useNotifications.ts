import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/providers/AuthProvider';
import { saveSWAuth, clearSWAuth, saveSWFirebaseConfig, saveSWNotificationPrefs } from '@/lib/notificationBridge';
import type { NotificationPrefs, TransactionType } from '@/types';

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  deposit: true,
  withdrawal: true,
  return: true,
  interest: true,
  opening_balance: true,
};

type PermissionState = 'granted' | 'denied' | 'default';

export function useNotifications() {
  const { user, role } = useAuth();
  const [permission, setPermission] = useState<PermissionState>('default');
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  // Read current notification permission state
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission as PermissionState);
    }
  }, []);

  // Load notification preferences from Firestore
  useEffect(() => {
    if (!user) {
      setPrefs(DEFAULT_PREFS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        if (userDoc.exists()) {
          const data = userDoc.data();
          const stored = data.notificationPrefs as NotificationPrefs | undefined;
          if (stored) {
            const loadedPrefs = {
              enabled: stored.enabled ?? DEFAULT_PREFS.enabled,
              deposit: stored.deposit ?? DEFAULT_PREFS.deposit,
              withdrawal: stored.withdrawal ?? DEFAULT_PREFS.withdrawal,
              return: stored.return ?? DEFAULT_PREFS.return,
              interest: stored.interest ?? DEFAULT_PREFS.interest,
              opening_balance: stored.opening_balance ?? DEFAULT_PREFS.opening_balance,
            };
            setPrefs(loadedPrefs);
            // Also sync to IndexedDB for the service worker
            if (loadedPrefs.enabled) {
              await saveSWNotificationPrefs(loadedPrefs);
            }
          }
        }
      } catch (error) {
        console.error('Error loading notification prefs:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // Request browser notification permission
  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (typeof Notification === 'undefined') {
      console.warn('Notifications not supported in this browser');
      return 'denied';
    }

    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    return result as PermissionState;
  }, []);

  // Enable notifications: request permission + save UID for SW + update prefs
  const enableNotifications = useCallback(async () => {
    if (!user || role !== 'viewer') return;

    const perm = await requestPermission();
    if (perm !== 'granted') return;

    const newPrefs: NotificationPrefs = { ...prefs, enabled: true };
    setPrefs(newPrefs);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPrefs: newPrefs,
        updatedAt: serverTimestamp(),
      });
      await saveSWAuth(user.uid);
      // Also save Firebase config for the SW to initialize Firestore
      await saveSWFirebaseConfig({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
      // Tell the service worker to start its Firestore listener
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'START_NOTIFICATIONS' });
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      // Revert on failure
      setPrefs((prev) => ({ ...prev, enabled: false }));
    }
  }, [user, role, prefs, requestPermission]);

  // Disable notifications: update prefs + clear SW auth
  const disableNotifications = useCallback(async () => {
    if (!user) return;

    const newPrefs: NotificationPrefs = { ...prefs, enabled: false };
    setPrefs(newPrefs);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPrefs: newPrefs,
        updatedAt: serverTimestamp(),
      });
      await clearSWAuth();
      // Also clear prefs from IndexedDB
      await saveSWNotificationPrefs(null);
      // Tell the service worker to stop its Firestore listener
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'STOP_NOTIFICATIONS' });
      }
    } catch (error) {
      console.error('Error disabling notifications:', error);
      setPrefs((prev) => ({ ...prev, enabled: true }));
    }
  }, [user, prefs]);

  // Toggle a specific transaction type preference
  const toggleTypePref = useCallback(async (type: TransactionType) => {
    if (!user) return;

    const newPrefs: NotificationPrefs = {
      ...prefs,
      [type]: !prefs[type],
    };
    setPrefs(newPrefs);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPrefs: newPrefs,
        updatedAt: serverTimestamp(),
      });
      // Also sync to IndexedDB for the service worker
      if (newPrefs.enabled) {
        await saveSWNotificationPrefs(newPrefs);
      } else {
        await saveSWNotificationPrefs(null);
      }
    } catch (error) {
      console.error('Error updating notification pref:', error);
      setPrefs((prev) => ({ ...prev, [type]: !prev[type] }));
    }
  }, [user, prefs]);

  // Whether this user can use notifications (viewer only, on HTTPS/PWA)
  const isSupported = typeof Notification !== 'undefined' && role === 'viewer';

  return {
    permission,
    prefs,
    loading,
    isSupported,
    requestPermission,
    enableNotifications,
    disableNotifications,
    toggleTypePref,
  };
}
