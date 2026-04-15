/**
 * IndexedDB bridge for Service Worker communication.
 *
 * The service worker cannot access Firebase Auth directly, so we store
 * the user's UID and app-visibility state in IndexedDB, which both the
 * main thread and the service worker can read/write.
 */

import type { NotificationPrefs } from '@/types';

const DB_NAME = 'faf-savings-sw';
const DB_VERSION = 1;
const STORE_NAME = 'state';

interface SWState {
  uid: string | null;
  appVisible: boolean;
  firebaseConfig: Record<string, string> | null;
  notificationPrefs: Record<string, boolean> | null;
}

// ── IndexedDB helpers ──────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getItem<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function setItem<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeItem(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Public API (main thread & service worker) ──────────────────────

/** Save the current user's UID so the service worker can read it. */
export async function saveSWAuth(uid: string): Promise<void> {
  await setItem('uid', uid);
}

/** Clear the stored UID (called on logout). */
export async function clearSWAuth(): Promise<void> {
  await removeItem('uid');
}

/** Read the stored UID (used by the service worker). */
export async function getSWAuth(): Promise<string | null> {
  const uid = await getItem<string | null>('uid');
  return uid ?? null;
}

/** Mark the app as visible (foreground) so the SW suppresses notifications. */
export async function setAppVisible(visible: boolean): Promise<void> {
  await setItem('appVisible', visible);
}

/** Check whether the app is in the foreground (used by the SW). */
export async function isAppVisible(): Promise<boolean> {
  const visible = await getItem<boolean>('appVisible');
  return visible ?? true; // default to true (safer: don't notify if unknown)
}

/** Save Firebase config so the service worker can initialize Firestore. */
export async function saveSWFirebaseConfig(config: Record<string, string>): Promise<void> {
  await setItem('firebaseConfig', config);
}

/** Read the stored Firebase config (used by the service worker). */
export async function getSWFirebaseConfig(): Promise<Record<string, string> | null> {
  const config = await getItem<Record<string, string>>('firebaseConfig');
  return config ?? null;
}

/** Save notification preferences so the service worker can check them without Firestore. */
export async function saveSWNotificationPrefs(prefs: NotificationPrefs | null): Promise<void> {
  if (prefs) {
    await setItem('notificationPrefs', prefs);
  } else {
    await removeItem('notificationPrefs');
  }
}

/** Read stored notification prefs (used by the service worker). */
export async function getSWNotificationPrefs(): Promise<Record<string, boolean> | null> {
  const prefs = await getItem<Record<string, boolean>>('notificationPrefs');
  return prefs ?? null;
}

/** Read the full SW state (convenience for the service worker). */
export async function getSWState(): Promise<SWState> {
  const [uid, appVisible, firebaseConfig, notificationPrefs] = await Promise.all([
    getItem<string | null>('uid'),
    getItem<boolean>('appVisible'),
    getItem<Record<string, string>>('firebaseConfig'),
    getItem<Record<string, boolean>>('notificationPrefs'),
  ]);
  return { uid: uid ?? null, appVisible: appVisible ?? true, firebaseConfig: firebaseConfig ?? null, notificationPrefs: notificationPrefs ?? null };
}
