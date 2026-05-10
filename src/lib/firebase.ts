/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfigData);

// Use initializeFirestore with experimentalForceLongPolling to bypass corporate firewall/proxy WebSocket blocks
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfigData.firestoreDatabaseId);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signIn() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Sign in error:', error);
    if (error.code === 'auth/popup-blocked') {
      alert('The login popup was blocked. Please enable popups for this site or open the app in a new tab.');
    } else if (error.code === 'auth/popup-closed-by-user') {
      // Normal closure
    } else if (error.message?.includes('Cross-Origin-Opener-Policy')) {
      alert('A security policy (COOP) blocked the login popup. Please try opening the app in a new tab using the button in the top right.');
    }
    throw error;
  }
}

export async function signInWithEmail(email: string, pass: string) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error: any) {
    console.error('Email sign in error:', error);
    let message = 'Login failed. Please check your credentials.';
    if (error.code === 'auth/user-not-found') message = 'No account found with this email.';
    if (error.code === 'auth/wrong-password') message = 'Incorrect password.';
    if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
    throw new Error(message);
  }
}

export async function signUpWithEmail(email: string, pass: string, fullName: string) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    
    // Create a pending access request
    await setDoc(doc(db, 'access_requests', email.toLowerCase()), {
      email: email.toLowerCase(),
      fullName,
      uid: user.uid,
      status: 'PENDING',
      requestedAt: serverTimestamp()
    });
    
    return user;
  } catch (error: any) {
    console.error('Sign up error:', error);
    let message = 'Registration failed.';
    if (error.code === 'auth/email-already-in-use') message = 'A user with this email already exists.';
    if (error.code === 'auth/weak-password') message = 'Password is too weak. Must be at least 6 characters.';
    throw new Error(message);
  }
}

export async function resetPassword(email: string) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Password reset error:', error);
    throw error;
  }
}

// signOut logic...
export function signOut() {
  return auth.signOut();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
