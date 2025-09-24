// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./css/Navbar.css";
import { normalizeHandle, ensureAt } from "../utils/handle";
import { useTheme } from "../context/ThemeContext";
import MeModal from "../components/MeModal";
import { getFirestore, doc, runTransaction, serverTimestamp } from "firebase/firestore";

export default function Navbar({ onOpenAuth, onAddTrip, onViewTrips, onViewProfile, onNavigateHome }) {
  const { currentUser, profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const menuRef = useRef(null);

  // local copy of profile so Navbar UI can update immediately after save
  const [localProfile, setLocalProfile] = useState(profile);

  // keep localProfile synced with upstream profile when it changes
  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  // Listen for app-level profile updates (dispatched after save)
  useEffect(() => {
    const handler = (e) => {
      const updated = e?.detail;
      if (!updated) return;
      if (currentUser && currentUser.uid && (updated.uid === currentUser.uid || updated.uid === profile?.uid || !updated.uid)) {
        setLocalProfile((prev) => ({ ...prev, ...updated }));
      }
    };
    window.addEventListener("jift:profileUpdated", handler);
    return () => window.removeEventListener("jift:profileUpdated", handler);
  }, [currentUser, profile]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleToggleMenu = (e) => {
    e.preventDefault();
    setOpen((s) => !s);
  };

  const handleAddTrip = () => {
    setOpen(false);

    // If user not signed in, open auth modal (preferred) so they can login first.
    if (!currentUser || !currentUser.uid) {
      // prefer prop-based handler if provided, otherwise use local fallback
      if (typeof onOpenAuth === "function") {
        onOpenAuth("login");
      } else {
        // fallback: dispatch the same event the rest of the app listens for
        window.dispatchEvent(new CustomEvent("jift:openAuth", { detail: { section: "login" } }));
      }
      return;
    }

    if (typeof onAddTrip === "function") {
      onAddTrip();
    } else {
      window.dispatchEvent(new CustomEvent("jift:openAddTrip"));
      console.warn("[Navbar] onAddTrip missing — dispatched fallback event jift:openAddTrip");
    }
  };


  const handleViewTrips = () => {
    setOpen(false);

    const rawHandle = localProfile?.handle || (currentUser?.email && currentUser.email.split("@")[0]);

    if (!rawHandle) {
      try {
        if (typeof onNavigateHome === "function") {
          onNavigateHome();
        } else {
          window.location.href = `${window.location.origin}/`;
        }
      } catch (err) {
        console.error("[Navbar] navigation to home failed", err);
      }
      return;
    }

    const handleWithAt = ensureAt(rawHandle);

    if (typeof onViewTrips === "function") {
      onViewTrips(handleWithAt);
      return;
    }

    try {
      const withoutAt = normalizeHandle(handleWithAt);
      const encoded = encodeURIComponent(withoutAt);
      window.location.href = `${window.location.origin}/@${encoded}`;
    } catch (err) {
      console.warn("[Navbar] fallback navigation failed", err);
    }
  };

  const handleViewProfile = () => {
    setOpen(false);

    const rawHandle = localProfile?.handle || (currentUser?.email && currentUser.email.split("@")[0]);

    if (!rawHandle) {
      try {
        if (typeof onNavigateHome === "function") {
          onNavigateHome();
        } else {
          window.location.href = `${window.location.origin}/`;
        }
      } catch (err) {
        console.error("[Navbar] navigation to home failed", err);
      }
      return;
    }

    const handleWithAt = ensureAt(rawHandle);

    if (typeof onViewProfile === "function") {
      onViewProfile(handleWithAt);
      return;
    }

    try {
      const withoutAt = normalizeHandle(handleWithAt);
      const encoded = encodeURIComponent(withoutAt);
      window.location.href = `${window.location.origin}/@${encoded}/profile`;
    } catch (err) {
      console.warn("[Navbar] fallback profile navigation failed", err);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logout();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const displayName = localProfile?.handle ? `@${localProfile.handle}` : (currentUser?.email || "Guest");

  const handleOpenAuthClick = (mode = "login") => {
    if (typeof onOpenAuth === "function") {
      onOpenAuth(mode);
    } else {
      window.dispatchEvent(new CustomEvent("jift:openAuth", { detail: { section: mode } }));
    }
  };

  const handleLogoClick = (e) => {
    e?.preventDefault?.();
    if (typeof onNavigateHome === "function") {
      onNavigateHome();
      return;
    }
    try {
      window.location.href = `${window.location.origin}/`;
    } catch (err) {
      console.error("[Navbar] navigation to home failed", err);
    }
  };

  // Save handler (inside component so it can access currentUser/profile/localProfile)
  const handleSaveProfileToFirestore = async (updatedProfile) => {
    // Debug logs (remove in production if desired)
    console.log("DEBUG: currentUser:", currentUser);
    console.log("DEBUG: currentUser.uid:", currentUser?.uid);
    console.log("DEBUG: profile:", profile);
    console.log("DEBUG: profile.uid:", profile?.uid, "profile.id/docId:", profile?.id || profile?.docId);

    // Determine uid - prefer auth uid
    const authUid = currentUser?.uid || null;
    const uidFromProfile = profile?.uid || profile?.id || profile?.docId || null;
    const uid = authUid || uidFromProfile || updatedProfile.uid;
    if (!uid) throw new Error("Cannot determine user id. Please sign in and try again.");

    if (!currentUser || !currentUser.uid) {
      throw new Error("You must be signed in to update your profile.");
    }

    // ensure user edits own profile
    if (currentUser.uid !== uid) {
      throw new Error("You are not authorized to edit this profile.");
    }

    const db = getFirestore();
    const oldHandle = profile?.handle || "";
    const newHandle = updatedProfile.handle; // normalized by MeModal

    if (!newHandle) throw new Error("Invalid handle.");

    try {
      await runTransaction(db, async (tx) => {
        // All reads first
        const userRef = doc(db, "users", uid);
        const newHandleRef = doc(db, "handles", newHandle);

        const [newSnap, userSnap] = await Promise.all([tx.get(newHandleRef), tx.get(userRef)]);

        // If handle changed, read old handle mapping too
        let oldHandleRef = null;
        let oldSnap = null;
        if (oldHandle && oldHandle !== newHandle) {
          oldHandleRef = doc(db, "handles", oldHandle);
          oldSnap = await tx.get(oldHandleRef);
        }

        // Validate new handle
        if (newHandle !== oldHandle) {
          if (newSnap.exists()) {
            const data = newSnap.data();
            if (!data || data.uid !== uid) {
              throw new Error("Handle already taken. Choose another handle.");
            }
          }
        }

        // Perform writes after reads
        tx.set(userRef, {
          displayName: updatedProfile.displayName,
          handle: updatedProfile.handle,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        if (newHandle !== oldHandle) {
          if (!newSnap.exists()) {
            tx.set(newHandleRef, { uid, createdAt: serverTimestamp() });
          }
          // Note: we do NOT delete old handles from the client due to rules; server-side cleanup is recommended
        }
      });

      // === AFTER TRANSACTION SUCCEEDS: update local UI and notify app ===
      const propagated = {
        ...(localProfile || {}),
        displayName: updatedProfile.displayName,
        handle: updatedProfile.handle,
        updatedAt: new Date().toISOString(),
        uid,
      };

      setLocalProfile((p) => ({ ...p, ...propagated }));
      window.dispatchEvent(new CustomEvent("jift:profileUpdated", { detail: propagated }));

      return;
    } catch (err) {
      console.error("Profile save transaction failed:", err);
      if (err.message && /permission|unauth/i.test(err.message)) {
        throw new Error("Permission denied. Make sure you are signed in as the profile owner.");
      }
      throw new Error(err?.message || "Failed to save profile.");
    }
  };

  return (
    <>
      <nav className="navbar" style={{ zIndex: 1000 }}>
        <div className="navbar-left">
          <button
            className="logo-button"
            onClick={handleLogoClick}
            type="button"
            aria-label="Go to home"
          >
            <span className="logo">Jift</span>
          </button>
        </div>

        <div className="navbar-right" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            type="button"
            aria-label="Toggle theme"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>

          {currentUser ? (
            <div className="user-menu" ref={menuRef}>
              <button
                className="user-button"
                onClick={handleToggleMenu}
                aria-haspopup="true"
                aria-expanded={open}
                aria-label="Open user menu"
                type="button"
              >
                Hi, {displayName}
              </button>

              {open && (
                <ul className="user-dropdown" role="menu">
                  <li role="none">
                    <button
                      role="menuitem"
                      className="dropdown-item"
                      onClick={() => {
                        setOpen(false);
                        setShowProfileModal(true);
                      }}
                      type="button"
                    >
                      👤 Me
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="dropdown-item" onClick={handleViewTrips} type="button">
                      📁 My Trips
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="dropdown-item" onClick={handleAddTrip} type="button">
                      ➕ Add Trip
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="dropdown-item" onClick={handleLogout} type="button">
                      🚪 Logout
                    </button>
                  </li>
                </ul>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleOpenAuthClick("login")}
              className="theme-btn primary"
              type="button"
            >
              Login / Signup
            </button>
          )}
        </div>
      </nav>

      {showProfileModal && (
        <MeModal
          open={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          profile={localProfile}
          currentUser={currentUser}
          onSave={handleSaveProfileToFirestore}
        />
      )}
    </>
  );
}
