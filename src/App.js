// src/App.js
import React, { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";

import HomePage from "./pages/Home";   // landing page
import TravelPage from "./pages/Travel"; // public profile / trip page
import Test from "./pages/Test";
import createTripCallableFactory from "./api/createTripCallable";
import "./App.css";
import AuthModal from "./components/AuthModal";
import Navbar from "./components/Navbar";
import TripModal from "./components/TripModal";
import { addTrip } from "./services/trips";
import { useAuth } from "./context/AuthContext";
import { normalizeHandle } from "./utils/handle";
import { auth } from "./firebase";
/* Wrapper component to pass handle param to TravelPage */
function TravelPageWithHandle() {
  const { handle: rawHandle } = useParams();
  // console.log("TravelPageWithHandle - raw param:", rawHandle);

  // normalizeHandle strips leading @ already
  const normalized = normalizeHandle(rawHandle);

  // console.log("TravelPageWithHandle - normalized handle:", normalized);

  // If invalid, optionally redirect to home (or render 404)
  if (!normalized) {
    // console.warn("TravelPageWithHandle - invalid handle, navigating home");
    // either render Home or navigate programmatically
    // return <Navigate to="/" replace />;
    return <HomePage />; // or show a 404
  }

  return <TravelPage externalHandle={normalized} />;
}



/* Small debug helper that shows current location in the UI */
function LocationDebug() {
  const loc = useLocation();
  // console.log("LocationDebug - current location:", loc);
  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, background: "#111", color: "#fff", padding: 8, borderRadius: 6, zIndex: 9999 }}>
      <div style={{ fontSize: 12 }}>pathname: {loc.pathname}</div>
    </div>
  );
}

/* Wrapper so Navbar can call navigate handlers */
function NavbarWithNavigate({ onOpenAuth, onAddTrip }) {
  const navigate = useNavigate();
  // console.log("NavbarWithNavigate - component rendered");

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
    // console.log("NavbarWithNavigate - handleNavigateHome called, navigating to /");
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
  // console.log("App - component rendered");
  const [authMode, setAuthMode] = useState(null); // null | "login" | "signup"
  const [showAddTripModal, setShowAddTripModal] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const { currentUser } = useAuth();

    // choose emulator vs prod
  const EMULATOR = false; // set true for local testing with emulator
  const API_BASE = EMULATOR
    ? "http://127.0.0.1:5001/travel-6c761/us-central1/api"
    : "https://us-central1-travel-6c761.cloudfunctions.net/api";

  // createTripCallable instance (memo not strictly required)
  const createTripCallable = React.useMemo(() => {
    return createTripCallableFactory({ auth, apiBase: API_BASE });
  }, [API_BASE]);


  // console.log("App - currentUser:", currentUser);

  const openAuth = (mode) => {
    // console.log("App - openAuth called with mode:", mode);
    setAuthMode(mode);
  };
  const closeAuth = () => {
    // console.log("App - closeAuth called");
    setAuthMode(null);
  };

  const openAddTrip = () => {
    // console.log("App - openAddTrip called");
    setShowAddTripModal(true);
  };
  const closeAddTrip = () => {
    // console.log("App - closeAddTrip called");
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
        // Prefer server-side atomic create (reserves slug)
        const result = await createTripCallable.createTrip({
          slug: tripData.slug,
          tripData,
        });
        // result is expected to be { id, slug } (or similar)
        closeAddTrip();
        return result;
      }

      // Fallback to legacy on-client addTrip (your existing implementation)
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


  // console.log("App - authMode:", authMode);
  // console.log("App - showAddTripModal:", showAddTripModal);
  // console.log("App - savingTrip:", savingTrip);
  // console.log("App - saveError:", saveError);

  return (
    <div>
      <BrowserRouter>
        <LocationDebug />
        <NavbarWithNavigate onOpenAuth={openAuth} onAddTrip={openAddTrip} />

        <main style={{ minHeight: "calc(100vh - 120px)" }}>
          <Routes>
            <Route path="/debug" element={<div>Debug route</div>} />
            <Route path="/test" element={<Test />} />
            <Route path="/" element={<HomePage />} />

            {/* Travel profile pages */}
            <Route path="/Travel/:handle" element={<TravelPageWithHandle />} />

            {/* Fallback */}
            <Route path="*" element={<HomePage />} />
          </Routes>

        </main>

        {/* Auth modal */}
        {authMode && (
          <AuthModal mode={authMode} onClose={closeAuth} onSwitch={(m) => {
            // console.log("App - AuthModal switch called with mode:", m);
            setAuthMode(m);
          }} />
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
      </BrowserRouter>
    </div>
  );
}

export default App;
