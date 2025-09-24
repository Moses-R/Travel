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
    createPublicProfileWithHandle,
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

  // refs for accessibility & focus management
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const firstFocusableRef = useRef(null);
  const lastFocusableRef = useRef(null);

  // Cleanup recaptcha on unmount
  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear?.();
          window.recaptchaVerifier = null;
        } catch (e) { }
      }
    };
  }, []);

  // -----------------------
  // IMPORTANT CHANGE:
  // Remove auto-show on mount; only open afterAuthSuccess or based on refreshProfile
  // -----------------------

  // Normalize & debounce availability check (unchanged but we disallow Save until available)
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
    // Preserve signup fields so user can retry quickly; only clear OTP & handle step state when fully closing
    setOtpCode("");
    setOtpSent(false);
    setShowHandleStep(false);
    setHandleInput("");
    setHandleNormalized("");
    setHandleAvailable(null);
    if (onClose) onClose();
  };

  // Focus trapping and Escape handling
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
      if (e.key === "Tab") {
        // basic focus trap
        const focusable = dialogRef.current?.querySelectorAll(
          'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

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

    // Defensive refresh
    if (typeof refreshProfile === "function") {
      try {
        const refreshed = await refreshProfile();
        if (refreshed && !refreshed.handle) {
          setShowHandleStep(true);
          setHandleInput(displayName ? displayName.split(" ")[0] : "");
          return;
        }
        close();
        return;
      } catch (e) {
        console.warn("[AuthModal] refreshProfile failed in afterAuthSuccess", e);
        setShowHandleStep(true);
        setHandleInput(displayName ? displayName.split(" ")[0] : "");
        return;
      }
    }

    // fallback
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
      setError(err?.message || "Auth error — please check your credentials.");
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

  // generate a few handle suggestions
  const generateHandleSuggestions = () => {
    const base = normalizeHandle(name || handleInput || "you") || "user";
    const suggestions = [];
    for (let i = 0; i < 4; i++) {
      const suffix = i === 0 ? "" : Math.floor(Math.random() * 900 + 100).toString();
      suggestions.push((base + suffix).slice(0, 30));
    }
    return suggestions;
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

      // copy to clipboard for convenience (best effort)
      try {
        await navigator.clipboard.writeText(`@${res.handle}`);
      } catch (err) {
        // ignore if not allowed
      }

      window.location.href = `/@${res.handle}`;
    } catch (err) {
      console.error("[AuthModal] createPublicProfileWithHandle failed", err);
      if (err?.code === "already-exists") {
        if (profile?.handle && profile.handle === normalized) {
          // idempotent success
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

  // copy handle helper
  const copyHandle = async () => {
    if (!handleNormalized) return;
    try {
      await navigator.clipboard.writeText(`@${handleNormalized}`);
    } catch (e) {
      // fallback: select and let user copy
      setError("Copy not allowed by browser — please copy manually.");
    }
  };

  // overlay click: be careful not to close when user is mid-handle-claim
  const onOverlayMouseDown = (e) => {
    // if click outside dialog, close only when not in critical step or confirmation
    if (!dialogRef.current) return;
    if (!dialogRef.current.contains(e.target)) {
      // if currently entering handle and has unsaved input, don't close — treat as friendly guard
      if (showHandleStep && (handleInput || checkingHandle || loading)) {
        setError("Press 'Skip for now' or save your handle before closing.");
        return;
      }
      close();
    }
  };

  return (
    <div
      className="auth-modal-overlay"
      onMouseDown={onOverlayMouseDown}
      ref={overlayRef}
      aria-hidden={false}
    >
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        <button
          className="auth-close"
          onClick={close}
          aria-label="Close authentication dialog"
          title="Close"
        >
          &times;
        </button>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={`tab ${section === "email" ? "active" : ""}`}
            onClick={() => setSection("email")}
            aria-pressed={section === "email"}
          >
            Email
          </button>
          <button
            className={`tab ${section === "phone" ? "active" : ""}`}
            onClick={() => setSection("phone")}
            aria-pressed={section === "phone"}
          >
            Phone
          </button>
        </div>

        {showHandleStep ? (
          <div>
            <h3 id="auth-modal-title">Create your public handle</h3>
            <div style={{ marginBottom: 8 }}>
              <label htmlFor="handle-input" className="auth-hint">
                Choose a short, memorable handle people will use to find you.
              </label>
              <input
                id="handle-input"
                placeholder="Choose a handle (letters, numbers, hyphens)"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                autoFocus
                aria-describedby="handle-status"
              />
              <div id="handle-status" className="handle-status" style={{ marginTop: 6 }}>
                {checkingHandle ? (
                  <span className="inline-spin">Checking availability…</span>
                ) : handleNormalized ? (
                  handleAvailable ? (
                    <span className="handle-success">@{handleNormalized} is available</span>
                  ) : (
                    <span className="handle-error">@{handleNormalized} is taken</span>
                  )
                ) : (
                  <span className="muted">Enter a handle to check availability</span>
                )}
              </div>
            </div>

            <div className="suggestions-row" style={{ marginBottom: 8 }}>
              <div className="auth-hint" style={{ marginBottom: 6 }}>
                Suggestions:
              </div>
              <div className="suggestions">
                {generateHandleSuggestions().map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="suggestion-btn"
                    onClick={() => setHandleInput(s)}
                    title={`Use @${s}`}
                  >
                    @{s}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
              <button
                className="btn primary"
                onClick={handleClaimHandle}
                disabled={loading || checkingHandle || !handleAvailable}
                aria-disabled={loading || checkingHandle || !handleAvailable}
                title={handleAvailable ? "Save handle" : "Save disabled until handle is available"}
              >
                {loading ? <span className="btn-loading" aria-hidden /> : "Save handle"}
              </button>

              <button className="btn" onClick={skipHandleStep} disabled={loading}>
                Skip for now
              </button>

              <button
                className="btn ghost"
                onClick={copyHandle}
                disabled={!handleNormalized}
                title={handleNormalized ? `Copy @${handleNormalized}` : "No handle to copy"}
              >
                {handleNormalized ? `Copy @${handleNormalized}` : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {section === "email" ? (
              <>
                <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                  <button
                    className={`small-tab ${mode === "login" ? "active" : ""}`}
                    onClick={() => setMode("login")}
                  >
                    Login
                  </button>
                  <button
                    className={`small-tab ${mode === "signup" ? "active" : ""}`}
                    onClick={() => setMode("signup")}
                  >
                    Signup
                  </button>
                </div>

                <form className="auth-form" onSubmit={handleEmailSubmit}>
                  {mode === "signup" && (
                    <input
                      placeholder="Full name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}

                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

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
                  <div style={{ marginBottom: 6, color: "var(--muted-text)", fontSize: 13 }}>Or continue with</div>
                  <button
                    className="btn google"
                    onClick={handleGoogle}
                    disabled={loading}
                    aria-label="Continue with Google"
                    title="Continue with Google"
                  >
                    <span className="google-inner">
                      <svg className="google-icon" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <path fill="#EA4335" d="M9 6.6v2.4h4.2c-.18 1.14-.96 2.64-2.64 3.06L9 12.6c1.62 0 3.24-.84 4.02-2.16H9z" />
                        <path fill="#34A853" d="M9 15c1.98 0 3.72-.66 5.04-1.8l-2.4-1.92C11.64 12.18 10.44 12.6 9 12.6 6.66 12.6 4.8 11.04 3.9 9l-2.4 1.8C2.88 13.86 5.64 15 9 15z" />
                        <path fill="#4A90E2" d="M15.96 7.32H9v2.4h4.38c-.18.84-.66 1.62-1.44 2.16l2.4 1.92C17.76 12.66 18.9 10.2 18.9 9c0-.9-.18-1.62-.54-2.28z" />
                        <path fill="#FBBC05" d="M3.9 9c0-.66.12-1.26.36-1.8L1.86 5.34C1.26 6.42 0.9 7.68 0.9 9s.36 2.58.96 3.66l2.4-1.8c-.24-.54-.36-1.14-.36-1.8z" />
                      </svg>
                      <span className="google-text">Continue with Google</span>
                    </span>
                  </button>

                </div>
              </>
            ) : (
              <>
                <div>
                  {!otpSent ? (
                    <>
                      <input
                        placeholder="Phone (E.164) e.g. +919999888777"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
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
                      <div style={{ marginBottom: 8, color: "var(--text)" }}>Enter the OTP sent to {phone}</div>
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
                <div id="recaptcha-container" style={{ marginTop: 12 }} aria-hidden={false}></div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
