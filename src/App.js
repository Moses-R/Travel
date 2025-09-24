// src/App.js
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";

import HomePage from "./pages/Home";   // landing page
import TravelPage from "./pages/Travel"; // public profile / trip page
import Test from "./pages/Test";
import createTripCallableFactory from "./api/createTripCallable";
import "./App.css";
import AuthModal from "./components/AuthModal";
import Navbar from "./components/Navbar";
import TripModal from "./components/TripModal";
import Footer from "./components/Footer";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Contact from "./pages/Contact";
import { setFavicon, setTitle } from "./utils/setMeta";
import { addTrip } from "./services/trips";
import { useAuth } from "./context/AuthContext";
import { normalizeHandle } from "./utils/handle";
import { auth } from "./firebase";
import { useTheme } from "./context/ThemeContext";

/* Wrapper component to pass handle + slug params to TravelPage */
function TravelPageWithHandle() {
  const { handle: rawHandleParam, slug: rawSlugParam } = useParams();

  const rawHandle = typeof rawHandleParam === "string" ? decodeURIComponent(rawHandleParam) : "";
  const rawSlug = typeof rawSlugParam === "string" ? decodeURIComponent(rawSlugParam) : "";

  let handle = "";
  let slug = "";

  if (rawSlug) {
    handle = rawHandle.replace(/^@+/, "").replace(/^\/+|\/+$/g, "");
    slug = rawSlug.replace(/^\/+|\/+$/g, "");
  } else {
    const seg = rawHandle.replace(/^\/+|\/+$/g, "");
    if (!seg) {
      handle = "";
      slug = "";
    } else if (seg.startsWith("@")) {
      handle = seg.replace(/^@+/, "");
      slug = "";
    } else if (seg.includes("-")) {
      handle = "";
      slug = seg;
    } else {
      handle = seg;
      slug = "";
    }
  }

  const normalized = handle ? normalizeHandle(handle) : null;

  if (!normalized && !slug) {
    return <HomePage />;
  }

  return <TravelPage externalHandle={normalized} externalSlug={slug || null} />;
}

/* Wrapper so Navbar can call navigate handlers */
function NavbarWithNavigate({ onOpenAuth, onAddTrip }) {
  const navigate = useNavigate();

  const handleViewTrips = (handle) => {
    if (!handle) {
      navigate("/");
      return;
    }
    const raw = String(handle).replace(/^@/, "");
    const normalized = normalizeHandle(raw);
    if (!normalized) {
      navigate("/");
      return;
    }
    navigate(`/Travel/@${normalized}`);
  };

  const handleNavigateHome = () => {
    navigate("/");
  };

  return (
    <Navbar
      onOpenAuth={onOpenAuth}
      onAddTrip={onAddTrip}
      onViewTrips={handleViewTrips}
      onNavigateHome={handleNavigateHome}
    />
  );
}

function App() {
  const [authMode, setAuthMode] = useState(null);
  const [showAddTripModal, setShowAddTripModal] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const { currentUser } = useAuth();
  const { theme } = useTheme();

  const EMULATOR = false;
  const API_BASE = EMULATOR
    ? "http://127.0.0.1:5001/travel-6c761/us-central1/api"
    : "https://us-central1-travel-6c761.cloudfunctions.net/api";

  useEffect(() => {
    // Example: dynamic tab title
    if (currentUser) {
      setTitle(`Jift | Welcome ${currentUser.displayName || "User"}`);
    } else {
      setTitle("Jift | Travel Planner");
    }

    // Example: dynamic favicon
    if (theme === "dark") {
      setFavicon("/favicon-dark32.png");
    } else {
      setFavicon("/favicon-light32.png");
    }
  }, [currentUser, theme]);

  useEffect(() => {
    const onOpenFromAnywhere = () => setShowAddTripModal(true);
    window.addEventListener("jift:openAddTrip", onOpenFromAnywhere);
    return () => window.removeEventListener("jift:openAddTrip", onOpenFromAnywhere);
  }, []);


  const createTripCallable = React.useMemo(() => {
    return createTripCallableFactory({ auth, apiBase: API_BASE });
  }, [API_BASE]);

  const openAuth = (mode) => setAuthMode(mode);
  const closeAuth = () => setAuthMode(null);

  // inside App()
  const openAddTrip = () => {
    // If user not signed in, open auth modal instead of AddTrip.
    if (!currentUser?.uid) {
      setAuthMode("login");
      return;
    }
    setShowAddTripModal(true);
  };

  const closeAddTrip = () => {
    setShowAddTripModal(false);
    setSaveError(null);
  };

  const handleSaveTrip = async (tripData) => {
    if (!currentUser?.uid) {
      setSaveError("You must be logged in to create a trip.");
      setAuthMode("login");
      return;
    }

    setSavingTrip(true);
    setSaveError(null);

    try {
      if (createTripCallable && typeof createTripCallable.createTrip === "function") {
        const result = await createTripCallable.createTrip({
          slug: tripData.slug,
          tripData,
        });
        closeAddTrip();
        return result;
      }

      const id = await addTrip(tripData, currentUser.uid);
      closeAddTrip();
      return id;
    } catch (err) {
      console.error("App - handleSaveTrip create error:", err);
      setSaveError(err?.message || "Failed to save trip.");
      throw err;
    } finally {
      setSavingTrip(false);
    }
  };

  return (
    <div>
      <BrowserRouter>
        <NavbarWithNavigate onOpenAuth={openAuth} onAddTrip={openAddTrip} />

        <main style={{ minHeight: "calc(100vh - 160px)" }}>
          <Routes>
            <Route path="/debug" element={<div>Debug route</div>} />
            <Route path="/test" element={<Test />} />
            <Route path="/" element={<HomePage />} />

            {/* Travel profile pages */}
            <Route path="/Travel/:handle/:slug?" element={<TravelPageWithHandle />} />
            <Route path="/Travel/:slug" element={<TravelPageWithHandle />} />

            {/* Legal / contact pages */}
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />

            {/* Fallback */}
            <Route path="*" element={<HomePage />} />
          </Routes>
        </main>

        {/* Auth modal */}
        {authMode && (
          <AuthModal mode={authMode} onClose={closeAuth} onSwitch={(m) => setAuthMode(m)} />
        )}

        {/* Central TripModal */}
        <TripModal
          open={showAddTripModal}
          onClose={closeAddTrip}
          onSave={handleSaveTrip}
          saving={savingTrip}
          currentUserId={currentUser?.uid || null}
          createTripCallable={createTripCallable}
        />

        {/* Inline error toast */}
        {saveError && (
          <div style={{ position: "fixed", bottom: 20, right: 20, background: "#ffe6e6", padding: 12, borderRadius: 8 }}>
            <strong>Error:</strong> {saveError}
          </div>
        )}

        {/* Site-wide footer */}
        <Footer />
      </BrowserRouter>
    </div>
  );
}

export default App;
