import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { saveSWAuth, clearSWAuth, setAppVisible, saveSWFirebaseConfig } from '@/lib/notificationBridge';
import type { Role } from '@/types';

interface AuthContextType {
  user: User | null;
  role: Role | null;
  loading: boolean;
  isMaintainer: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  isMaintainer: false,
});

// localStorage key for the cached role. We keep one entry per UID so a
// sign-out / sign-in as a different user on a shared device still
// reads the right value.
const ROLE_CACHE_KEY = (uid: string) => `faf.role.${uid}`;

function readCachedRole(uid: string): Role | null {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY(uid));
    if (raw === 'maintainer' || raw === 'viewer') return raw;
    return null;
  } catch {
    return null;
  }
}

function writeCachedRole(uid: string, role: Role) {
  try {
    localStorage.setItem(ROLE_CACHE_KEY(uid), role);
  } catch {
    /* quota or private mode: ignore */
  }
}

function clearCachedRole(uid: string) {
  try {
    localStorage.removeItem(ROLE_CACHE_KEY(uid));
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Read the cached role synchronously so the UI does not block
        // on a Firestore round-trip after every page load.
        const cached = readCachedRole(firebaseUser.uid);
        if (cached) setRole(cached);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const freshRole = data.role as Role;
            // Update only if changed; revalidation in the background.
            if (freshRole !== cached) setRole(freshRole);
            writeCachedRole(firebaseUser.uid, freshRole);
            // If user is a viewer with notifications enabled, bridge UID to service worker
            if (data.role === 'viewer' && data.notificationPrefs?.enabled) {
              try {
                await saveSWAuth(firebaseUser.uid);
                // Also save Firebase config for the SW to initialize Firestore
                await saveSWFirebaseConfig({
                  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
                  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
                  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
                  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
                  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                  appId: import.meta.env.VITE_FIREBASE_APP_ID,
                });
                // Notify SW to start its Firestore listener
                if (navigator.serviceWorker?.controller) {
                  navigator.serviceWorker.controller.postMessage({ type: 'START_NOTIFICATIONS' });
                }
              } catch (error) {
                console.error('Failed to initialize SW notifications:', error);
              }
            }
          } else if (cached === null) {
            // Unknown user with no cache; default to viewer to be safe.
            setRole('viewer');
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
        }
      } else {
        setRole(null);
        // Clear SW auth and stop listener on logout
        await clearSWAuth();
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'STOP_NOTIFICATIONS' });
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Wipe the cached role for a user when their role is removed or
  // revoked. If a different user signs in on the same browser, also
  // clean up any leftover entries older than 30 days.
  useEffect(() => {
    if (!user) return;
    return () => clearCachedRole(user.uid);
  }, [user]);

  // Track app visibility for foreground notification suppression
  useEffect(() => {
    const handleVisibilityChange = () => {
      setAppVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Initialize as visible
    setAppVisible(true);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        isMaintainer: role === 'maintainer',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
