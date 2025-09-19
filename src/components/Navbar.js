// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./css/Navbar.css";
import { normalizeHandle, ensureAt } from "../utils/handle";
import { useTheme } from "../context/ThemeContext";

export default function Navbar({ onOpenAuth, onAddTrip, onViewTrips, onViewProfile, onNavigateHome }) {
  const { currentUser, profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

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
    if (typeof onAddTrip === "function") onAddTrip();
    else {
      window.dispatchEvent(new CustomEvent("jift:openAddTrip"));
      console.warn("[Navbar] onAddTrip missing — dispatched fallback event jift:openAddTrip");
    }
  };

  // Navigate to the user's trips page (renamed UI label to "My Trips")
  const handleViewTrips = () => {
    setOpen(false);

    // Prefer profile.handle, otherwise derive from email local-part
    const rawHandle = profile?.handle || (currentUser?.email && currentUser.email.split("@")[0]);

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
      // Fallback: go to user's public page (assumed to show trips by default)
      window.location.href = `${window.location.origin}/@${encoded}`;
    } catch (err) {
      console.warn("[Navbar] fallback navigation failed", err);
    }
  };

  // New: Navigate to the user's profile page
  const handleViewProfile = () => {
    setOpen(false);

    const rawHandle = profile?.handle || (currentUser?.email && currentUser.email.split("@")[0]);

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
      // Fallback profile route — adjust if your app uses a different profile path
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

  const displayName = profile?.handle ? `@${profile.handle}` : (currentUser?.email || "Guest");

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

  return (
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
        {/* 🌙 / ☀️ Theme toggle button */}
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
                  <button role="menuitem" className="dropdown-item" onClick={handleViewProfile} type="button">
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
  );
}
