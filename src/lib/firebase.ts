/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
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
