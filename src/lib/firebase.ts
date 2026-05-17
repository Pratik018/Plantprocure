/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import CryptoJS from 'crypto-js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
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
    if (error.code === 'auth/popup-closed-by-user') {
      // User closed the popup, this is a normal action, so we just return null silently
      return null;
    }
    
    console.error('Sign in error:', error);
    
    if (error.code === 'auth/popup-blocked') {
      alert('The login popup was blocked. Please enable popups for this site or open the app in a new tab.');
    } else if (error.code === 'auth/unauthorized-domain') {
      alert(`The domain "${window.location.hostname}" is not authorized in the Firebase Console. \n\nPlease add it under Authentication > Settings > Authorized domains.`);
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
    
    // Update profile with fullName
    await updateProfile(user, { displayName: fullName });
    
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

// --- Encryption Utilities ---
const ENCRYPTION_KEY = (import.meta as any).env.VITE_ENCRYPTION_KEY || 'plant-procure-ledger-default-secret';

/**
 * Encrypts a string using AES.
 */
export function encrypt(text: any): any {
  if (text === null || text === undefined) return text;
  
  // If it's an object, stringify it first
  const stringToEncrypt = typeof text === 'object' ? JSON.stringify(text) : String(text);
  
  try {
    return `__ENC__${CryptoJS.AES.encrypt(stringToEncrypt, ENCRYPTION_KEY).toString()}`;
  } catch (e) {
    console.error("Encryption failed:", e);
    return text;
  }
}

/**
 * Decrypts a string using AES. Returns original if not encrypted or decryption fails.
 */
export function decrypt(cipherText: any): any {
  if (typeof cipherText !== 'string' || !cipherText.startsWith('__ENC__')) {
    return cipherText;
  }

  const actualCipher = cipherText.substring(7); // Remove __ENC__ prefix

  try {
    const bytes = CryptoJS.AES.decrypt(actualCipher, ENCRYPTION_KEY);
    const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedData) return cipherText; // Decryption failed or resulted in empty string

    // Try to parse as JSON if it looks like an object/array
    if ((decryptedData.startsWith('{') && decryptedData.endsWith('}')) || 
        (decryptedData.startsWith('[') && decryptedData.endsWith(']'))) {
      try {
        return JSON.parse(decryptedData);
      } catch {
        return decryptedData;
      }
    }
    
    return decryptedData;
  } catch (e) {
    return cipherText;
  }
}

/**
 * Encrypts sensitive fields in a procurement object for storage.
 */
export function encryptProcurement(data: any): any {
  const encrypted = { ...data };
  const fieldsToEncrypt = [
    'userName', 
    'requestName', 
    'itemDescription', 
    'purpose', 
    'adminRemarks', 
    'vendorName', 
    'invoiceNumber', 
    'purchaseRemarks', 
    'purchaserName', 
    'approvalNoteNo',
    'additionalItems'
  ];

  fieldsToEncrypt.forEach(field => {
    if (encrypted[field] !== undefined) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  });

  return encrypted;
}

/**
 * Decrypts sensitive fields in a procurement object for display.
 */
export function decryptProcurement(data: any): any {
  const decrypted = { ...data };
  const fieldsToDecrypt = [
    'userName', 
    'requestName', 
    'itemDescription', 
    'purpose', 
    'adminRemarks', 
    'vendorName', 
    'invoiceNumber', 
    'purchaseRemarks', 
    'purchaserName', 
    'approvalNoteNo',
    'additionalItems'
  ];

  fieldsToDecrypt.forEach(field => {
    if (decrypted[field] !== undefined) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  });

  return decrypted;
}

/**
 * Encrypts a message object.
 */
export function encryptMessage(data: any): any {
  const encrypted = { ...data };
  if (encrypted.text !== undefined) {
    encrypted.text = encrypt(encrypted.text);
  }
  return encrypted;
}

/**
 * Decrypts a message object.
 */
export function decryptMessage(data: any): any {
  const decrypted = { ...data };
  if (decrypted.text !== undefined) {
    decrypted.text = decrypt(decrypted.text);
  }
  return decrypted;
}
