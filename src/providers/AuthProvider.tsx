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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole(data.role as Role);
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
