// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./css/Navbar.css";
import { normalizeHandle, ensureAt } from "../utils/handle";
import { useTheme } from "../context/ThemeContext";
import MeModal from "../components/MeModal";
import { getFirestore, doc, runTransaction, serverTimestamp } from "firebase/firestore";

// NEW: notifications hook & client
import useNotifications from "../hooks/useNotifications";
import { markNotificationRead, markMultipleRead } from "../libs/notificationsClient";

export default function Navbar({ onOpenAuth, onAddTrip, onViewTrips, onViewProfile, onNavigateHome }) {
  const { currentUser, profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const menuRef = useRef(null);

  // NEW: separate state for notification dropdown open
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  // local copy of profile so Navbar UI can update immediately after save
  const [localProfile, setLocalProfile] = useState(profile);

  // keep localProfile synced with upstream profile when it changes
  useEffect(() => setLocalProfile(profile), [profile]);

  // useNotifications provides real-time notifications + unread count
  const { notifications, loading: notifLoading, unreadCount } = useNotifications({ limitResults: 20 });

  // close menus when clicking outside or pressing Escape (also handle notif dropdown)
  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setNotifOpen(false);
      }
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

  const handleToggleNotif = (e) => {
    e?.preventDefault?.();
    setNotifOpen((s) => !s);
  };

  // existing handlers (unchanged)...
  const handleAddTrip = () => {
    setOpen(false);
    if (!currentUser || !currentUser.uid) {
      if (typeof onOpenAuth === "function") {
        onOpenAuth("login");
      } else {
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

  // Save handler (unchanged)
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

  // ---------- Notification actions ----------
  async function handleMarkSingleRead(id) {
    // optimistic update locally (optional)
    // Fire-and-forget callable; errors logged to console
    try {
      await markNotificationRead(id);
    } catch (err) {
      console.error("markNotificationRead failed", err);
    }
  }

  async function handleMarkAllRead() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    try {
      // prefer server-side batch callable if available
      await markMultipleRead(ids);
    } catch (err) {
      // fallback: call single-mark repeatedly
      try {
        await Promise.all(ids.map((id) => markNotificationRead(id)));
      } catch (err2) {
        console.error("mark all read failed", err2);
      }
    }
  }

  // helper to format createdAt timestamps
  function formatDate(ts) {
    if (!ts) return "";
    if (typeof ts.toDate === "function") return ts.toDate().toLocaleString();
    return new Date(ts).toLocaleString();
  }

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

          {/* ---------- Notification bell ---------- */}
          <div className="notif-wrapper" ref={notifRef} style={{ position: "relative" }}>
            <button
              className="notif-bell"
              onClick={handleToggleNotif}
              type="button"
              aria-haspopup="true"
              aria-expanded={notifOpen}
              aria-label="Open notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="notif-badge" aria-hidden="true">{unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className="notif-dropdown" role="menu" aria-label="Notifications">
                <div className="notif-dropdown-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px" }}>
                  <strong>Notifications</strong>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setNotifOpen(false)} type="button" className="notif-action">
                      X
                    </button>

                  </div>
                </div>

                <div className="notif-list" style={{ maxHeight: 320, overflowY: "auto" }}>
                  {notifLoading && <div className="muted" style={{ padding: 12 }}>Loading…</div>}

                  {!notifLoading && notifications.length === 0 && (
                    <div className="muted" style={{ padding: 12 }}>No notifications.</div>
                  )}

                  {notifications.map((n) => (
                    <div key={n.id} className={`notif-item ${n.read ? "read" : "unread"}`} style={{ padding: 10, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title || "Notification"}</div>
                        <div style={{ color: "#444", fontSize: 13, whiteSpace: "normal", overflowWrap: "break-word" }}>{n.text}</div>
                        <div style={{ fontSize: 12, color: "#888" }}>{formatDate(n.createdAt)}</div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                        {!n.read && (
                          <button
                            onClick={() => handleMarkSingleRead(n.id)}
                            type="button"
                            className="small"
                          >
                            Mark read
                          </button>
                        )}
                        {n.url && (
                          <a href={n.url} target="_blank" rel="noopener noreferrer">Open</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------- User menu ---------- */}
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
