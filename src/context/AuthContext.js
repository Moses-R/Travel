// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase"; // your firebase.js should export initialized auth and db
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { normalizeHandle } from "../utils/handle";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

let phoneConfirmationResult = null;

/* -------------------------
   Handle-related functions
--------------------------*/
async function claimHandle(rawHandle, displayName = null) {
  console.debug("[AuthContext] claimHandle called", { rawHandle, displayName });

  const handle = normalizeHandle(rawHandle);
  if (!handle) {
    const e = new Error("Invalid handle");
    e.code = "invalid-argument";
    throw e;
  }

  const user = auth.currentUser;
  if (!user) {
    const e = new Error("Not authenticated");
    e.code = "permission-denied";
    throw e;
  }

  const userRef = doc(db, "users", user.uid);

  // Check if user already has a handle
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const existingHandle = userSnap.data()?.handle;
    if (existingHandle) {
      if (existingHandle === handle) {
        // Idempotent success
        return { handle, uid: user.uid, displayName: userSnap.data().displayName || "" };
      }
      const e = new Error("User already has a handle");
      e.code = "already-exists";
      throw e;
    }
  }

  const handleRef = doc(db, "handles", handle);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const handleSnap = await transaction.get(handleRef);
      if (handleSnap.exists()) {
        const data = handleSnap.data();
        if (data?.uid === user.uid) {
          transaction.set(userRef, { handle }, { merge: true });
          return { handle, uid: user.uid, displayName: displayName ?? user.displayName ?? "" };
        }
        const e = new Error("Handle already taken");
        e.code = "already-exists";
        throw e;
      }

      transaction.set(handleRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      transaction.set(
        userRef,
        {
          displayName: displayName ?? user.displayName ?? "",
          email: user.email ?? "",
          photoURL: user.photoURL ?? "",
          role: "rider",
          handle,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return { handle, uid: user.uid, displayName: displayName ?? user.displayName ?? "" };
    });

    return result;
  } catch (err) {
    console.error("[AuthContext] claimHandle transaction error", err);
    if (err?.code === "already-exists") throw err;
    const e = new Error(err?.message || "Could not claim handle");
    e.code = err?.code || "internal";
    throw e;
  }
}

// Alias for compatibility with your UI
async function createPublicProfileWithHandle(rawHandle, displayName = null) {
  return claimHandle(rawHandle, displayName);
}

// Handle availability check
async function checkHandleAvailabilityCallable(rawHandle) {
  if (rawHandle && typeof rawHandle === "object" && rawHandle.target) {
    rawHandle = rawHandle.target.value;
  }

  const handle = normalizeHandle(rawHandle);
  if (!handle) return { available: false, reason: "empty" };

  try {
    const ref = doc(db, "handles", handle);
    const snap = await getDoc(ref);
    return { available: !snap.exists() };
  } catch (err) {
    const e = new Error(err?.message || "Could not check handle");
    e.code = err?.code || "internal";
    throw e;
  }
}

/* -------------------------
   AuthProvider component
--------------------------*/
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Keep user/profile in sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const uref = doc(db, "users", user.uid);
          const snap = await getDoc(uref);
          if (!snap.exists()) {
            await setDoc(uref, {
              displayName: user.displayName || "",
              email: user.email || "",
              phoneNumber: user.phoneNumber || null,
              role: "rider",
              createdAt: new Date().toISOString(),
            });
            setProfile({
              displayName: user.displayName || "",
              email: user.email || "",
            });
          } else {
            setProfile(snap.data());
          }
        } catch (e) {
          console.error("[AuthContext] could not ensure user doc", e);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  /* -------------------------
     Auth helper functions
  --------------------------*/

  // Refresh profile manually
  const refreshProfile = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      const uref = doc(db, "users", user.uid);
      const snap = await getDoc(uref);
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        return data;
      } else {
        setProfile(null);
        return null;
      }
    } catch (e) {
      console.error("[AuthContext] refreshProfile failed", e);
      return null;
    }
  };

  // Email signup
  const signupEmail = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try {
      if (displayName) await updateProfile(cred.user, { displayName });
    } catch (e) {
      console.warn("[AuthContext] updateProfile failed", e);
    }
    await setDoc(doc(db, "users", cred.user.uid), {
      displayName: displayName || "",
      email,
      role: "rider",
      createdAt: new Date().toISOString(),
    });
    return cred;
  };

  // Email login
  const loginEmail = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Google auth
  const signupOrLoginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    await setDoc(
      doc(db, "users", user.uid),
      {
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        role: "rider",
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return result;
  };

  // Phone: send OTP
  const sendPhoneOtp = async (phoneNumber, recaptchaContainerId = "recaptcha-container") => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        recaptchaContainerId,
        { size: "invisible", callback: () => {} },
        auth
      );
    }
    const appVerifier = window.recaptchaVerifier;
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    phoneConfirmationResult = confirmationResult;
    return confirmationResult;
  };

  // Phone: verify OTP
  const verifyPhoneOtp = async (code) => {
    if (!phoneConfirmationResult) throw new Error("No OTP request in progress.");
    const result = await phoneConfirmationResult.confirm(code);
    const user = result.user;
    await setDoc(
      doc(db, "users", user.uid),
      {
        displayName: user.displayName || "",
        phoneNumber: user.phoneNumber || "",
        role: "rider",
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
    phoneConfirmationResult = null;
    return result;
  };

  // Logout
  const logout = async () => {
    try {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear?.();
        window.recaptchaVerifier = null;
      }
    } catch (e) {
      console.warn("[AuthContext] recaptcha clear failed", e);
    }
    return signOut(auth);
  };

  /* -------------------------
     Context value
  --------------------------*/
  const value = {
    currentUser,
    profile,
    signupEmail,
    loginEmail,
    signupOrLoginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    logout,
    refreshProfile,
    createPublicProfileWithHandle, // alias to claimHandle
    claimHandle,
    checkHandleAvailabilityCallable,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}
