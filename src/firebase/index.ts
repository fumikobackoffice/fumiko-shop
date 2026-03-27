'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
// Use a global variable to cache SDK instances across HMR (Hot Module Replacement)
let cachedSdks: {
  firebaseApp: FirebaseApp;
  firestore: any;
  auth: any;
  storage: any;
} | null = null;

export function initializeFirebase() {
  // If we already have cached instances, return them immediately
  if (cachedSdks) return cachedSdks;

  let firebaseApp: FirebaseApp;
  
  if (!getApps().length) {
    try {
      // Attempt to initialize via Firebase App Hosting environment variables
      firebaseApp = initializeApp();
    } catch (e) {
      // Fallback to firebase config object during development
      if (process.env.NODE_ENV === "production") {
        console.warn('Automatic initialization failed. Falling back to firebase config object.', e);
      }
      firebaseApp = initializeApp(firebaseConfig);
    }
  } else {
    firebaseApp = getApp();
  }

  // Use initializeFirestore with settings for better stability in unstable dev environments
  // This helps prevent "Unexpected state" errors during Fast Refresh.
  const firestore = getFirestore(firebaseApp);
  const auth = getAuth(firebaseApp);
  const storage = getStorage(firebaseApp);

  cachedSdks = {
    firebaseApp,
    firestore,
    auth,
    storage,
  };

  return cachedSdks;
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    firestore: getFirestore(firebaseApp),
    auth: getAuth(firebaseApp),
    storage: getStorage(firebaseApp),
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
