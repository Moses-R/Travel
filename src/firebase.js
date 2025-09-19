// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

/*
  Your Firebase config — keep these values here.
  (You already have real values; this file will reuse an existing app if present.)
*/
const firebaseConfig = {
  apiKey: "AIzaSyA902QydwbyByIH3HIObTao1t-wjvrhoPc",
  authDomain: "travel-6c761.firebaseapp.com",
  projectId: "travel-6c761",
  storageBucket: "travel-6c761.appspot.com",
  messagingSenderId: "547051952230",
  appId: "1:547051952230:web:050c3c320ce24fe21135a7",
  measurementId: "G-V4KYBY84GW",
};

// Basic sanity check to avoid initializing with clearly bad/placeholder config
const isConfigured =
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes("FILL_ME") &&
  firebaseConfig.projectId &&
  firebaseConfig.appId;

let app = null;
let analytics = null;

// HMR / multi-init safe: reuse an app if it already exists
if (isConfigured) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    // Analytics only in browser + if measurementId present
    if (typeof window !== "undefined" && firebaseConfig.measurementId) {
      try {
        analytics = getAnalytics(app);
      } catch (e) {
        // analytics may throw in some dev environments; ignore
        // console.warn("Analytics not available", e);
      }
    }
  } catch (err) {
    // In rare cases initializeApp may still throw; try to reuse existing app
    try {
      app = getApp();
    } catch (e) {
      console.error("Firebase initialization error:", err, e);
      app = null;
    }
  }
} else {
  console.warn("Firebase config missing/placeholder - running in local-only mode.");
}

// Export services (or null if Firebase isn't configured)
export const firebaseApp = app;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const firebaseAnalytics = analytics;

export const isFirebaseConfigured = Boolean(app);

export default firebaseApp;
