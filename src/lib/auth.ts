import { signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth } from './firebase';

export async function login(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
