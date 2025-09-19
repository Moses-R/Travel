// src/components/AuthModal.jsx (edited to avoid auto-show on mount)
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { normalizeHandle } from "../utils/handle";
import "./css/AuthModal.css";

export default function AuthModal({ onClose }) {
  const {
    currentUser,
    profile,
    signupEmail,
    loginEmail,
    signupOrLoginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    createPublicProfileWithHandle, // alias to claimHandle (transactional)
    checkHandleAvailabilityCallable,
    refreshProfile,
    logout,
  } = useAuth();

  // Auth form state
  const [section, setSection] = useState("email"); // "email" | "phone"
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  // Handle step state
  const [showHandleStep, setShowHandleStep] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [handleNormalized, setHandleNormalized] = useState("");
  const [handleAvailable, setHandleAvailable] = useState(null);
  const [checkingHandle, setCheckingHandle] = useState(false);

  // Misc
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDebounceRef = useRef(null);

  // Cleanup recaptcha on unmount
  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear?.();
          window.recaptchaVerifier = null;
        } catch (e) {}
      }
    };
  }, []);

  // -----------------------
  // IMPORTANT CHANGE:
  // Remove the auto-show-on-mount effect that used:
  //    if (currentUser && profile && !profile.handle) setShowHandleStep(true);
  // We DO NOT auto-open on mount. Instead we only open in afterAuthSuccess (post-signup)
  // or when refreshProfile proves the user has no handle.
  // -----------------------

  // Normalize & debounce availability check (unchanged)
  useEffect(() => {
    const n = normalizeHandle(handleInput || "");
    setHandleNormalized(n);
    setHandleAvailable(null);

    if (!n) {
      setCheckingHandle(false);
      if (handleDebounceRef.current) {
        clearTimeout(handleDebounceRef.current);
        handleDebounceRef.current = null;
      }
      return;
    }

    setCheckingHandle(true);
    if (handleDebounceRef.current) clearTimeout(handleDebounceRef.current);
    handleDebounceRef.current = setTimeout(async () => {
      try {
        if (typeof checkHandleAvailabilityCallable === "function") {
          const res = await checkHandleAvailabilityCallable(n);
          setHandleAvailable(Boolean(res?.available));
        } else {
          // Conservative fallback: treat as unavailable
          setHandleAvailable(false);
        }
      } catch (e) {
        console.warn("[AuthModal] handle availability check failed", e);
        setHandleAvailable(false);
      } finally {
        setCheckingHandle(false);
      }
    }, 350);

    return () => {
      if (handleDebounceRef.current) clearTimeout(handleDebounceRef.current);
    };
  }, [handleInput, checkHandleAvailabilityCallable]);

  const close = () => {
    setError("");
    setEmail("");
    setPassword("");
    setName("");
    setPhone("");
    setOtpCode("");
    setOtpSent(false);
    setShowHandleStep(false);
    setHandleInput("");
    setHandleNormalized("");
    setHandleAvailable(null);
    if (onClose) onClose();
  };

  // -----------------------
  // afterAuthSuccess: central place to decide whether to show handle step
  // -----------------------
  async function afterAuthSuccess(userCredential, displayName) {
    const isNew = !!userCredential?.additionalUserInfo?.isNewUser;

    // If the SDK says this is a new user, always prompt for handle (reasonable UX)
    if (isNew) {
      setShowHandleStep(true);
      setHandleInput(displayName ? displayName.split(" ")[0] : "");
      return;
    }

    // If not obviously new, do a defensive refresh of profile to confirm server state
    // (this avoids popup if the server already has a handle)
    if (typeof refreshProfile === "function") {
      try {
        const refreshed = await refreshProfile();
        // If profile exists and has no handle, show handle step
        if (refreshed && !refreshed.handle) {
          setShowHandleStep(true);
          setHandleInput(displayName ? displayName.split(" ")[0] : "");
          return;
        }
        // If refreshed profile has handle (or refresh returned null), treat as returning user -> close modal
        close();
        return;
      } catch (e) {
        // If refresh failed, be conservative: show handle step so new users aren't blocked
        console.warn("[AuthModal] refreshProfile failed in afterAuthSuccess", e);
        setShowHandleStep(true);
        setHandleInput(displayName ? displayName.split(" ")[0] : "");
        return;
      }
    }

    // Fallback: if we can't refresh, only show handle step if profile exists and has no handle
    if (currentUser && profile && !profile.handle) {
      setShowHandleStep(true);
      setHandleInput(displayName ? displayName.split(" ")[0] : "");
    } else {
      close();
    }
  }

  // Email submit
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await loginEmail(email, password);
        close();
      } else {
        const cred = await signupEmail(email, password, name);
        const syntheticCred = { ...cred, additionalUserInfo: { isNewUser: true } };
        await afterAuthSuccess(syntheticCred, name);
      }
    } catch (err) {
      console.error("[AuthModal] email auth error", err);
      setError(err?.message || "Auth error");
    } finally {
      setLoading(false);
    }
  };

  // Google
  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signupOrLoginWithGoogle();
      await afterAuthSuccess(result, result.user?.displayName ?? name);
    } catch (err) {
      console.error("[AuthModal] Google sign-in error", err);
      setError(err?.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  // Phone - send OTP
  const handleSendOtp = async () => {
    setError("");
    if (!phone) {
      setError("Enter phone in E.164 format (e.g. +919999888777)");
      return;
    }
    setLoading(true);
    try {
      await sendPhoneOtp(phone, "recaptcha-container");
      setOtpSent(true);
    } catch (err) {
      console.error("[AuthModal] sendPhoneOtp failed", err);
      setError(err?.message || "Could not send OTP");
    } finally {
      setLoading(false);
    }
  };

  // Phone - verify OTP
  const handleVerifyOtp = async () => {
    setError("");
    if (!otpCode) {
      setError("Enter the OTP code");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPhoneOtp(otpCode);
      await afterAuthSuccess(result, result.user?.displayName ?? "");
    } catch (err) {
      console.error("[AuthModal] verifyPhoneOtp failed", err);
      setError(err?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Claim handle
  const handleClaimHandle = async () => {
    setError("");
    const normalized = normalizeHandle(handleInput || "");
    if (!normalized) {
      setError("Please enter a valid handle");
      return;
    }

    setLoading(true);
    try {
      const res = await createPublicProfileWithHandle(normalized, name || undefined);

      // Refresh profile so popup won't reappear on next login
      if (typeof refreshProfile === "function") {
        try {
          await refreshProfile();
        } catch (refreshErr) {
          console.warn("[AuthModal] refreshProfile failed after claiming handle", refreshErr);
        }
      }

      setShowHandleStep(false);
      close();
      window.location.href = `/@${res.handle}`;
    } catch (err) {
      console.error("[AuthModal] createPublicProfileWithHandle failed", err);
      if (err?.code === "already-exists") {
        if (profile?.handle && profile.handle === normalized) {
          // idempotent success: user already owns the handle
          setShowHandleStep(false);
          close();
          window.location.href = `/@${normalized}`;
        } else if (profile?.handle && profile.handle !== normalized) {
          setError("You already have a different handle associated with your account.");
        } else {
          setError("That handle is already taken — please try another.");
        }
      } else if (err?.code === "permission-denied") {
        setError("You must be signed in to claim a handle.");
      } else if (err?.code === "invalid-argument") {
        setError("Invalid handle. Use letters, numbers, hyphens or underscores.");
      } else {
        setError(err?.message || "Could not claim handle. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const skipHandleStep = () => {
    setShowHandleStep(false);
    close();
  };

  return (
    <div className="auth-modal-overlay" onMouseDown={close}>
      <div className="auth-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={close}>
          &times;
        </button>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={`tab ${section === "email" ? "active" : ""}`} onClick={() => setSection("email")}>
            Email
          </button>
          <button className={`tab ${section === "phone" ? "active" : ""}`} onClick={() => setSection("phone")}>
            Phone
          </button>
        </div>

        {showHandleStep ? (
          <div>
            <h3>Create your public handle</h3>
            <div style={{ marginBottom: 8 }}>
              <input
                placeholder="Choose a handle (letters, numbers, hyphens)"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {checkingHandle ? (
                  <span>Checking availability…</span>
                ) : handleNormalized ? (
                  handleAvailable ? (
                    <span style={{ color: "green" }}>@{handleNormalized} is available</span>
                  ) : (
                    <span style={{ color: "red" }}>@{handleNormalized} is taken</span>
                  )
                ) : (
                  <span>Enter a handle to check availability</span>
                )}
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn primary" onClick={handleClaimHandle} disabled={loading}>
                {loading ? "Saving…" : "Save handle"}
              </button>
              <button className="btn" onClick={skipHandleStep} disabled={loading}>
                Skip for now
              </button>
            </div>
          </div>
        ) : (
          <>
            {section === "email" ? (
              <>
                <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                  <button className={`small-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
                    Login
                  </button>
                  <button className={`small-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>
                    Signup
                  </button>
                </div>

                <form className="auth-form" onSubmit={handleEmailSubmit}>
                  {mode === "signup" && (
                    <input placeholder="Full name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
                  )}

                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />

                  {error && <div className="auth-error">{error}</div>}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="submit" className="btn primary" disabled={loading}>
                      {loading ? (mode === "login" ? "Logging in…" : "Signing up…") : mode === "login" ? "Login" : "Create account"}
                    </button>
                    <button type="button" className="btn" onClick={close}>
                      Cancel
                    </button>
                  </div>
                </form>

                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 6, color: "#666", fontSize: 13 }}>Or continue with</div>
                  <button className="btn google" onClick={handleGoogle} disabled={loading}>
                    Continue with Google
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  {!otpSent ? (
                    <>
                      <input placeholder="Phone (E.164) e.g. +919999888777" value={phone} onChange={(e) => setPhone(e.target.value)} />
                      {error && <div className="auth-error">{error}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn primary" onClick={handleSendOtp} disabled={loading}>
                          {loading ? "Sending…" : "Send OTP"}
                        </button>
                        <button className="btn" onClick={close}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: 8, color: "#444" }}>Enter the OTP sent to {phone}</div>
                      <input placeholder="Enter OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
                      {error && <div className="auth-error">{error}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn primary" onClick={handleVerifyOtp} disabled={loading}>
                          {loading ? "Verifying…" : "Verify OTP"}
                        </button>
                        <button className="btn" onClick={() => { setOtpSent(false); setOtpCode(""); }}>
                          Back
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div id="recaptcha-container" style={{ marginTop: 12 }}></div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
