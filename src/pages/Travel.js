// src/pages/Travel.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./css/Travel.css";
import Modal from "../components/Modal";
import EditTripModal from "../components/EditTripModal";
import { useParams, useNavigate } from "react-router-dom";
import { normalizeHandle } from "../utils/handle";
import { updateDoc } from "firebase/firestore";
import { onAuthStateChanged /* no auto-anon here */, getAuth } from "firebase/auth";
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { firebaseApp, auth, db, storage, isFirebaseConfigured } from "../firebase";

/* ---------- leaflet icon fix ---------- */
try {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
    iconUrl: require("leaflet/dist/images/marker-icon.png"),
    shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
  });
} catch (e) { }

/* ---------- firebase usage flag ---------- */
const useFirebase = Boolean(isFirebaseConfigured && firebaseApp && auth && db && storage);

/* ---------- helpers ---------- */
const localUid = (prefix = "trip") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function normalizeDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

async function uploadFileToStorage(userId, tripId, file) {
  if (!useFirebase || !storage) throw new Error("Firebase storage not initialized");
  const key = `${userId}/trips/${tripId}/${Date.now()}_${file.name}`;
  const ref = storageRef(storage, key);
  const snapshot = await uploadBytes(ref, file);
  const url = await getDownloadURL(snapshot.ref);
  return url;
}

// GoogleEmbedMap: renders either an iframe src URL or a full iframe HTML string.
function GoogleEmbedMap({ embedHtmlOrUrl, height = 340 }) {
  if (!embedHtmlOrUrl) {
    return (
      <div className="map-box section" style={{ height }}>
        <div className="muted" style={{
          height: "100%", display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          No Google map embed provided.
        </div>
      </div>
    );
  }

  // Accept either full <iframe ...> HTML or a raw src URL
  const srcMatch = String(embedHtmlOrUrl).match(/src=["']([^"']+)["']/);
  const src = srcMatch ? srcMatch[1] : embedHtmlOrUrl;

  return (
    <div className="map-box section" style={{ height, overflow: "hidden", borderRadius: 8 }}>
      <iframe
        title="Custom Google Map"
        src={src}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}

/* ---------- component ---------- */
export default function Travel() {
  const params = useParams();
  const navigate = useNavigate();

  let routeHandle = (params.handle || "").toString();

  useEffect(() => {
    // // // console.debug("[Travel] pathname:", window.location.pathname, "search:", window.location.search, "hash:", window.location.hash);
  }, []);

  if (!routeHandle) {
    try {
      const m = window.location.pathname.match(/@([^\/\?#]+)/);
      if (m && m[1]) {
        routeHandle = m[1];
        // // // console.debug("[Travel] extracted handle from pathname fallback:", routeHandle);
      }
    } catch (e) { }
  }

  const [tripTitle, setTripTitle] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");
  const [tripPrivate, setTripPrivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null });
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [position, setPosition] = useState(null);
  const watchIdRef = useRef(null);
  const [itinerary, setItinerary] = useState([]);
  const [media, setMedia] = useState([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [savedTrips, setSavedTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [user, setUser] = useState(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(routeHandle));
  const [isPublicView, setIsPublicView] = useState(Boolean(routeHandle));
  const [resolvedUid, setResolvedUid] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [tripStartLocation, setTripStartLocation] = useState("");
  const [tripDestination, setTripDestination] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [tripToEdit, setTripToEdit] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmItin, setConfirmItin] = useState({ open: false, id: null, title: null });
  const [googleEmbedInput, setGoogleEmbedInput] = useState("");
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [confirmRemoveYoutube, setConfirmRemoveYoutube] = React.useState(false);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [savingYouTube, setSavingYouTube] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);

  // Derived helper used in JSX to decide owner-only UI
  const isOwner = Boolean(user && selectedTrip && (user.uid === selectedTrip.ownerId || user.uid === selectedTrip.owner_id));

  // helper: extract src from iframe HTML or return the raw URL
  function extractEmbedSrc(input) {
    if (!input) return "";
    const m = String(input).match(/src=["']([^"']+)["']/);
    if (m && m[1]) return m[1];
    // also allow URL with query params that looks like google maps embed link
    return String(input).trim();
  }

  async function saveGoogleEmbedForSelectedTrip() {
    if (!selectedTrip || !selectedTrip.trip_id) {
      setToast({ msg: "Select a trip first", type: "warning" });
      setTimeout(() => setToast(null), 2000);
      return;
    }
    const src = extractEmbedSrc(googleEmbedInput || selectedTrip.googleEmbed || "");
    if (!src) {
      setToast({ msg: "Please paste an iframe or embed URL", type: "warning" });
      setTimeout(() => setToast(null), 2200);
      return;
    }

    // update local UI immediately
    const payload = { trip_id: selectedTrip.trip_id, googleEmbed: src };
    applyLocalEdit(payload);
    setSelectedTrip((s) => s ? { ...s, googleEmbed: src } : s);
    setToast({ msg: "Map embed applied", type: "success" });
    setTimeout(() => setToast(null), 1400);

    // persist to Firestore if configured and current user is the owner
    const isOwner = user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid);
    if (useFirebase && db && user && isOwner) {
      try {
        const dr = doc(db, "trips", selectedTrip.trip_id);
        await updateDoc(dr, { googleEmbed: src, updatedAt: new Date().toISOString() });
        setToast({ msg: "Map embed saved to trip", type: "success" });
        setTimeout(() => setToast(null), 1400);
        return;
      } catch (err) {
        console.error("save google embed to firestore failed", err);
        setToast({ msg: "Saved locally (failed to persist)", type: "warning" });
        setTimeout(() => setToast(null), 2000);
      }
    } else {
      // local-only
      setToast({ msg: "Embed stored locally (not persisted)", type: "info" });
      setTimeout(() => setToast(null), 1400);
    }
  }
  // top-level helper: remove youtubeId from current selectedTrip (no confirm here — modal handles confirmation)
  async function clearYouTubeFromTrip() {
    if (!selectedTrip || !selectedTrip.trip_id) return;

    try {
      const isOwner = user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid);

      if (isOwner && useFirebase && db) {
        const dr = doc(db, "trips", selectedTrip.trip_id);
        await updateDoc(dr, { youtubeId: "", updatedAt: new Date().toISOString() });
        applyLocalEdit && applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: "" });
      } else {
        // local-only fallback
        applyLocalEdit && applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: "" });
      }

      setToast && setToast({ msg: "YouTube link removed", type: "info" });
      setTimeout(() => setToast && setToast(null), 1200);
    } catch (err) {
      console.error("clearYouTubeFromTrip failed", err);
      setToast && setToast({ msg: "Failed to remove link", type: "warning" });
      setTimeout(() => setToast && setToast(null), 1400);
    }
  }

  // helper: extract YouTube video id from many forms (url, embed, short)
  function extractYouTubeId(input) {
    if (!input) return null;
    const s = String(input).trim();
    // iframe src
    const srcMatch = s.match(/src=["']([^"']+)["']/);
    const candidate = srcMatch ? srcMatch[1] : s;
    // common patterns
    const m =
      candidate.match(/(?:v=)([A-Za-z0-9_\-]{6,})/) ||
      candidate.match(/(?:youtu\.be\/)([A-Za-z0-9_\-]{6,})/) ||
      candidate.match(/\/embed\/([A-Za-z0-9_\-]{6,})/) ||
      candidate.match(/youtube\.com\/shorts\/([A-Za-z0-9_\-]{6,})/);
    return m ? m[1] : null;
  }

  // ---------- helper: visibility ----------
  function getVisibilityInfo(trip, user) {
    if (!trip) return { icon: "❓", label: "Unknown" };
    const visibility = trip.visibility || (trip.private ? "private" : "public");
    const isOwner = user && (trip.ownerId === user.uid || trip.owner_id === user.uid);

    if (visibility === "public") return { icon: "🌐", label: "Public" };

    if (visibility === "private") {
      if (isOwner) return { icon: "🔒", label: "Private (you own this)" };
      if (Array.isArray(trip.allowedUsers) && user && trip.allowedUsers.includes(user.uid)) {
        return { icon: "🔑", label: "Restricted (you have access)" };
      }
      return { icon: "🔒", label: "Private" };
    }

    return { icon: "❓", label: "Unknown" };
  }

  useEffect(() => {
    // // console.debug("[Travel] mount", { routeHandle, useFirebase, params });
  }, []);

  /* ---------- resolve handle -> uid ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      setNotFound(false);
      setResolvedUid(null);
      setProfile(null);
      try {
        if (!routeHandle) {
          setIsPublicView(false);
          if (!cancelled) setProfileLoading(false);
          return;
        }

        const normalized = normalizeHandle(routeHandle);
        if (!normalized) {
          setNotFound(true);
          if (!cancelled) setProfileLoading(false);
          return;
        }

        if (!useFirebase) {
          setToast({ msg: "Firebase not configured — showing local demo view", type: "warning" });
          setTimeout(() => setToast(null), 2200);
          setIsPublicView(false);
          if (!cancelled) setProfileLoading(false);
          return;
        }

        try {
          const handleRef = doc(db, "handles", normalized);
          const handleSnap = await getDoc(handleRef);
          if (cancelled) return;

          if (handleSnap && typeof handleSnap.exists === "function" && handleSnap.exists()) {
            const data = handleSnap.data();
            const uid = data?.uid ?? null;
            if (!uid) {
              setNotFound(true);
              return;
            }
            setResolvedUid(uid);
            return;
          }

          const usersCol = collection(db, "users");
          const q = query(usersCol, where("handle", "==", normalized), orderBy("createdAt", "desc"));
          const snaps = await getDocs(q);
          if (cancelled) return;

          if (!snaps || snaps.empty) {
            setNotFound(true);
            return;
          }

          const docSnap = snaps.docs[0];
          setResolvedUid(docSnap.id);
          return;
        } catch (err) {
          console.error("[Travel] error resolving handle from Firestore:", err);
          setToast({ msg: "Error fetching profile — showing local view", type: "warning" });
          setTimeout(() => setToast(null), 2000);
          setIsPublicView(false);
          return;
        }
      } catch (err) {
        console.error("[Travel] unexpected error in handle resolver:", err);
        setNotFound(true);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeHandle, useFirebase]);

  /* ---------- load profile by uid ---------- */
  useEffect(() => {
    if (!resolvedUid) return;
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const uref = doc(db, "users", resolvedUid);
        const snap = await getDoc(uref);
        if (cancelled) return;
        if (snap && typeof snap.exists === "function" && snap.exists()) {
          setProfile(snap.data());
          setIsPublicView(true);
          setNotFound(false);
        } else {
          setProfile(null);
          setNotFound(true);
        }
      } catch (err) {
        console.error("[Travel] failed to load profile:", err);
        setProfile(null);
        setNotFound(true);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedUid]);

  /* ---------- trips subscription & auth handling ---------- */
  useEffect(() => {
    if (!useFirebase) {
      setFirebaseReady(false);
      return; // local only
    }

    let cancelled = false;
    let tripsUnsub = null;
    let authUnsub = null;

    const tripsMap = new Map(); // to merge multiple listeners

    // Normalizer for snapshot docs -> trip objects
    const processSnapshot = (snapshot) => {
      return snapshot.docs.map((d) => {
        const data = d.data() || {};
        const resolvedTitle =
          (data.title && String(data.title).trim()) ||
          (data.name && String(data.name).trim()) ||
          (data.slug && String(data.slug).replace(/[-_]/g, " ").trim()) ||
          null;
        return {
          trip_id: d.id,
          ...data,
          title: resolvedTitle || "Untitled Trip",
          start_date:
            (data.startDate && typeof data.startDate.toDate === "function")
              ? data.startDate.toDate().toISOString().slice(0, 10)
              : (data.startDate || data.start_date || null),
          end_date:
            (data.endDate && typeof data.endDate.toDate === "function")
              ? data.endDate.toDate().toISOString().slice(0, 10)
              : (data.endDate || data.end_date || null),
          private: (data.visibility === "private") || !!data.private,
          visibility: data.visibility || (data.private ? "private" : "public"),
          itinerary: data.itinerary || [],
          media: data.media || [],
          last_position: data.last_position || data.lastPosition || null,
          slug: data.slug || null,
          created_at:
            (data.createdAt && typeof data.createdAt.toDate === "function")
              ? data.createdAt.toDate().toISOString()
              : (data.createdAt || data.created_at || null),
          updated_at: data.updatedAt || data.updated_at || null,
          ownerId: data.owner_id || data.ownerId || null,
          allowedUsers: Array.isArray(data.allowedUsers) ? data.allowedUsers : [],
        };
      });
    };

    const pushSnapshotToMap = (items) => {
      items.forEach((t) => tripsMap.set(t.trip_id, t));
      const arr = Array.from(tripsMap.values()).sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta;
      });
      setSavedTrips(arr);
    };

    // load subscriptions based on owner / visitor logic
    const setupSubscriptions = (currentUser) => {
      // cleanup previous
      try {
        tripsUnsub && tripsUnsub();
      } catch (e) { }
      tripsMap.clear();

      const unsubscribers = [];

      const ownerId = resolvedUid || (currentUser && currentUser.uid) || null;
      // // console.debug("[Travel] subscribing trips for ownerId:", ownerId, "viewer:", currentUser?.uid);

      if (!ownerId) {
        setSavedTrips([]);
        tripsUnsub = null;
        return;
      }

      // If viewer is owner, subscribe to ALL trips by owner
      if (currentUser && currentUser.uid === ownerId) {
        const qOwner = query(collection(db, "trips"), where("owner_id", "==", ownerId), orderBy("createdAt", "desc"));
        const unsubOwner = onSnapshot(
          qOwner,
          (snap) => {
            const items = processSnapshot(snap);
            pushSnapshotToMap(items);
          },
          (err) => {
            console.error("owner trips onSnapshot error", err);
            setToast({ msg: "Failed to sync trips", type: "warning" });
            setTimeout(() => setToast(null), 2000);
          }
        );
        unsubscribers.push(unsubOwner);
      } else {
        // Not owner: public trips + restricted trips where user is allowed
        const qPublic = query(
          collection(db, "trips"),
          where("owner_id", "==", ownerId),
          where("visibility", "==", "public"),
          orderBy("createdAt", "desc")
        );
        const unsubPublic = onSnapshot(
          qPublic,
          (snap) => {
            const items = processSnapshot(snap);
            pushSnapshotToMap(items);
          },
          (err) => {
            console.error("public trips onSnapshot error", err);
          }
        );
        unsubscribers.push(unsubPublic);

        if (currentUser && currentUser.uid) {
          // restricted where allowedUsers contains current user
          const qAllowed = query(
            collection(db, "trips"),
            where("owner_id", "==", ownerId),
            where("allowedUsers", "array-contains", currentUser.uid),
            orderBy("createdAt", "desc")
          );
          const unsubAllowed = onSnapshot(
            qAllowed,
            (snap) => {
              const items = processSnapshot(snap);
              pushSnapshotToMap(items);
            },
            (err) => {
              console.error("allowed trips onSnapshot error", err);
            }
          );
          unsubscribers.push(unsubAllowed);
        }
      }

      tripsUnsub = () => {
        try {
          unsubscribers.forEach((u) => u && u());
        } catch (e) { }
      };
    };

    (async () => {
      try {
        // Wait for auth state; do NOT auto-sign-in anonymously here.
        authUnsub = onAuthStateChanged(auth, (u) => {
          setUser(u || null);
          setFirebaseReady(true);
          // reset savedTrips when auth changes
          setupSubscriptions(u);
        });
      } catch (err) {
        console.error("[Travel] Firebase init error", err);
        setFirebaseReady(false);
      }
    })();

    return () => {
      try { cancelled = true; } catch (e) { }
      try { authUnsub && authUnsub(); } catch (e) { }
      try { tripsUnsub && tripsUnsub(); } catch (e) { }
    };
  }, [resolvedUid]);

  /* ---------- trip:created event handler (prefer dispatched data; only fetch when authorized) ---------- */
  useEffect(() => {
    let mounted = true;

    const handleLoadedTripFromDoc = (docData) => {
      if (!mounted || !docData) return;
      const normalized = {
        trip_id: docData.trip_id || docData.id || `trip_local_${Date.now()}`,
        title: docData.title || "Untitled Trip",
        start_date: docData.start_date || docData.startDate || "",
        end_date: docData.end_date || docData.endDate || null,
        private: (docData.visibility === "private") || !!docData.private,
        itinerary: docData.itinerary || [],
        media: docData.media || [],
        last_position: docData.last_position || docData.lastPosition || null,
        created_at: docData.created_at || new Date().toISOString(),
        ownerId: docData.owner_id || docData.ownerId || null,
        visibility: docData.visibility || (docData.private ? "private" : "public"),
        allowedUsers: Array.isArray(docData.allowedUsers) ? docData.allowedUsers : (docData.allowed_users || []),
        ...docData,
      };

      setSavedTrips((prev) => {
        if (prev.some((t) => t.trip_id === normalized.trip_id)) return prev;
        return [normalized, ...prev];
      });

      setSelectedTripId(normalized.trip_id);
      setSelectedTrip(normalized);
      setTripTitle(normalized.title || "");
      setTripStart(normalized.start_date || "");
      setTripEnd(normalized.end_date || "");
      setTripPrivate(!!normalized.private);
      setItinerary(normalized.itinerary || []);
      setTripStartLocation(normalized.startLocation || "");
      setTripDestination(normalized.destination || "");
      setTripNotes(normalized.notes || "");

      setMedia(
        (normalized.media || []).map((x) => ({
          id: x.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: x.type || "image",
          url: x.storageUrl || x.url || "",
          name: x.name || "",
          date: x.date || new Date().toISOString(),
        }))
      );
      if (normalized.last_position) setPosition(normalized.last_position);

      setToast({ msg: "Trip added and loaded", type: "success" });
      setTimeout(() => setToast(null), 2000);
    };

    const onTripCreated = async (e) => {
      try {
        const detail = e?.detail || {};
        // If full trip object was dispatched, use it directly
        if (detail.trip) {
          handleLoadedTripFromDoc(detail.trip);
          return;
        }

        // Otherwise try to fetch only when safe
        const tripId = detail.trip_id || detail.id || null;
        const ownerHint = detail.owner_id || detail.ownerId || null;
        const visibilityHint = detail.visibility || null;

        let docData = null;

        if (useFirebase && user && tripId) {
          // If we are definitely the owner, fetch is allowed
          if (ownerHint && user.uid === ownerHint) {
            try {
              const dr = doc(db, "trips", tripId);
              const snap = await getDoc(dr);
              if (snap && snap.exists()) {
                docData = { trip_id: snap.id, ...snap.data() };
              }
            } catch (err) {
              console.error("fetch created trip error (owner)", err);
            }
          } else if (visibilityHint === "public") {
            // public trip — fetch allowed
            try {
              const dr = doc(db, "trips", tripId);
              const snap = await getDoc(dr);
              if (snap && snap.exists()) {
                docData = { trip_id: snap.id, ...snap.data() };
              }
            } catch (err) {
              console.error("fetch created trip error (public)", err);
            }
          } else if (user && user.uid && ownerHint && ownerHint !== user.uid) {
            // not owner: only fetch if user is in allowedUsers — but we don't have that info without reading.
            // To avoid permission errors, skip fetching and fall back to detail.
            // (Alternatively, you could attempt the fetch and catch a permission error.)
            try {
              const dr = doc(db, "trips", tripId);
              const snap = await getDoc(dr);
              if (snap && snap.exists()) {
                // If allowed, this will succeed; otherwise it will throw and be caught.
                docData = { trip_id: snap.id, ...snap.data() };
              }
            } catch (err) {
              console.warn("fetch created trip blocked by rules or not allowed:", err?.message || err);
            }
          } else {
            // no user or unknown owner: skip fetch
          }
        }

        if (!docData) {
          // fallback to the detail payload (local optimistic copy)
          const fallback = {
            trip_id: tripId || localUid(),
            title: detail.title || detail.name || "Untitled Trip",
            start_date: detail.start_date || detail.startDate || "",
            end_date: detail.end_date || detail.endDate || null,
            itinerary: detail.itinerary || [],
            media: detail.media || [],
            last_position: detail.last_position || null,
            created_at: detail.created_at || new Date().toISOString(),
            owner_id: ownerHint,
            visibility: visibilityHint || "private",
            allowedUsers: detail.allowedUsers || [],
            ...detail,
          };
          handleLoadedTripFromDoc(fallback);
          return;
        }

        // we have docData from Firestore
        handleLoadedTripFromDoc(docData);
      } catch (err) {
        console.error("Error handling trip:created:", err);
        setToast({ msg: "Trip added (partial)", type: "warning" });
        setTimeout(() => setToast(null), 2000);
      }
    };

    window.addEventListener("trip:created", onTripCreated);
    return () => {
      mounted = false;
      window.removeEventListener("trip:created", onTripCreated);
    };
  }, [user]);

  // create a local trip by dispatching `trip:created` event; existing listener will pick it up
  const createLocalTrip = (overrides = {}) => {
    const detail = {
      trip_id: localUid(),
      title: overrides.title || "New Trip",
      start_date: normalizeDate(new Date()),
      end_date: null,
      itinerary: [],
      media: [],
      last_position: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
    window.dispatchEvent(new CustomEvent("trip:created", { detail }));
  };

  async function uploadAndSaveMedia(items, tripId) {
    if (!useFirebase || !user) {
      console.warn("Firebase not available for media upload");
      return items;
    }
    const uploaded = [];
    for (const it of items) {
      try {
        if (it.file) {
          const storageUrl = await uploadFileToStorage(user.uid, tripId, it.file);
          uploaded.push({ ...it, storageUrl, url: storageUrl, file: undefined });
        } else {
          uploaded.push(it);
        }
      } catch (err) {
        console.error("upload file failed", err);
        uploaded.push(it);
      }
    }
    return uploaded;
  }

  // ---------- NEW: save itinerary to Firestore helper ----------
  async function saveItineraryForTrip(tripId, newItinerary) {
    if (!useFirebase || !db) {
      // Not configured — nothing to persist
      return { ok: false, reason: "no-firebase" };
    }
    if (!tripId) return { ok: false, reason: "no-trip-id" };
    try {
      const docRef = doc(db, "trips", tripId);
      // update only itinerary and updatedAt to avoid overwrite
      await updateDoc(docRef, { itinerary: newItinerary, updatedAt: new Date().toISOString() });
      return { ok: true };
    } catch (err) {
      console.error("[Travel] saveItineraryForTrip failed:", err);
      return { ok: false, reason: err?.message || String(err) };
    }
  }
  // open confirm modal for itinerary item
  const confirmDeleteItinerary = (itemId, title = "") => {
    setConfirmItin({ open: true, id: itemId, title });
  };

  // perform confirmed delete (calls existing deleteItineraryItem helper)
  const confirmDeleteItineraryConfirmed = async () => {
    const id = confirmItin.id;
    setConfirmItin({ open: false, id: null, title: null });
    if (!id) return;
    try {
      await deleteItineraryItem(id);
    } catch (err) {
      console.error("confirmed delete failed", err);
      setToast({ msg: "Failed to delete item", type: "warning" });
      setTimeout(() => setToast(null), 2000);
    }
  };

  // addItinerary: used by modal "Add"
  const addItinerary = async (item) => {
    // optimistic update local state (append item at end)
    setItinerary((prev) => {
      const arr = [...(Array.isArray(prev) ? prev : [])];
      arr.push(item);
      return arr;
    });

    // Try to persist if we have a selectedTrip and we own it
    const tripId = selectedTrip?.trip_id || selectedTripId;
    const isOwner = user && (selectedTrip?.ownerId === user.uid || selectedTrip?.owner_id === user.uid);
    if (useFirebase && db && tripId && isOwner) {
      try {
        // take current stored itinerary as base (fallback to local state)
        const base = Array.isArray(selectedTrip?.itinerary) ? [...selectedTrip.itinerary] : Array.isArray(itinerary) ? [...itinerary] : [];
        const newIt = [...base, item]; // append
        const res = await saveItineraryForTrip(tripId, newIt);
        if (res.ok) {
          applyLocalEdit({ trip_id: tripId, itinerary: newIt, updatedAt: new Date().toISOString() });
          setSelectedTrip((s) => s ? { ...s, itinerary: newIt } : s);
          setItinerary(newIt);
          setToast({ msg: "Itinerary saved", type: "success" });
          setTimeout(() => setToast(null), 1400);
          return;
        } else {
          setToast({ msg: "Saved locally (failed to sync)", type: "warning" });
          setTimeout(() => setToast(null), 2200);
          setSelectedTrip((s) => s ? { ...s, itinerary: newIt } : s);
          setItinerary(newIt);
          return;
        }
      } catch (err) {
        console.error("addItinerary persist error", err);
        setToast({ msg: "Saved locally (error persisting)", type: "warning" });
        setTimeout(() => setToast(null), 2200);
      }
    } else {
      // Not owner or no firebase => local only
      setSelectedTrip((s) => s ? { ...s, itinerary: [...(s.itinerary || []), item] } : s);
      setToast({ msg: "Added to local itinerary", type: "info" });
      setTimeout(() => setToast(null), 1500);
    }
  };

  // ---------- delete itinerary item ----------
  const deleteItineraryItem = async (itemId) => {
    if (!itemId) return;
    // optimistic local update
    setItinerary((prev) => (Array.isArray(prev) ? prev.filter((it) => it.id !== itemId) : prev));

    const tripId = selectedTrip?.trip_id || selectedTripId;
    const isOwner = user && (selectedTrip?.ownerId === user.uid || selectedTrip?.owner_id === user.uid);

    if (useFirebase && db && tripId && isOwner) {
      try {
        // base from selectedTrip if available to avoid race with local state
        const base = Array.isArray(selectedTrip?.itinerary) ? [...selectedTrip.itinerary] : (Array.isArray(itinerary) ? [...itinerary] : []);
        const newIt = base.filter((it) => it.id !== itemId);
        const res = await saveItineraryForTrip(tripId, newIt);
        if (res.ok) {
          applyLocalEdit({ trip_id: tripId, itinerary: newIt, updatedAt: new Date().toISOString() });
          setSelectedTrip((s) => (s ? { ...s, itinerary: newIt } : s));
          setItinerary(newIt);
          setToast({ msg: "Itinerary item deleted", type: "success" });
          setTimeout(() => setToast(null), 1400);
          return;
        } else {
          // persist failed; keep local change but warn
          setToast({ msg: "Deleted locally (failed to sync)", type: "warning" });
          setTimeout(() => setToast(null), 2200);
          setSelectedTrip((s) => (s ? { ...s, itinerary: newIt } : s));
          setItinerary(newIt);
          return;
        }
      } catch (err) {
        console.error("deleteItineraryItem persist error", err);
        setToast({ msg: "Deleted locally (error persisting)", type: "warning" });
        setTimeout(() => setToast(null), 2200);
      }
    } else {
      // local-only
      setSelectedTrip((s) =>
        s
          ? { ...s, itinerary: (Array.isArray(s.itinerary) ? s.itinerary.filter((it) => it.id !== itemId) : []) }
          : s
      );
      setToast({ msg: "Itinerary item removed (local only)", type: "info" });
      setTimeout(() => setToast(null), 1200);
    }
  };

  async function deleteTripConfirm(id) {
    if (!id) return;
    if (useFirebase && user) {
      try {
        await deleteDoc(doc(db, "trips", id));
      } catch (err) {
        console.error("delete trip firestore error", err);
        setSavedTrips((s) => s.filter((t) => t.trip_id !== id));
      }
    } else {
      setSavedTrips((s) => s.filter((t) => t.trip_id !== id));
    }
    if (selectedTripId === id) {
      setSelectedTripId(null);
      setSelectedTrip(null); // <- clear full selected trip too
    }
    setConfirmDelete({ open: false, id: null });
  }

  // save handler used by EditTripModal
  async function handleSaveEdit(updatedFields) {
    if (!tripToEdit || !tripToEdit.trip_id) return;
    setSavingEdit(true);
    try {
      const merged = { ...tripToEdit, ...updatedFields };

      // If media files were provided in the edit form, upload them first
      if (Array.isArray(merged.media)) {
        // detect items with .file and upload
        const needUpload = merged.media.some((m) => m && m.file);
        if (needUpload && useFirebase && user) {
          merged.media = await uploadAndSaveMedia(merged.media, merged.trip_id);
        }
      }

      // Persist to Firestore if configured and owner
      const isOwner = user && (merged.ownerId === user.uid || merged.owner_id === user.uid);
      if (useFirebase && user && isOwner) {
        try {
          // Only write the fields the UI cares about to avoid clobbering other server data.
          const docRef = doc(db, "trips", merged.trip_id);
          const payload = {
            title: merged.title,
            startDate: merged.start_date || merged.startDate || null,
            endDate: merged.end_date || merged.endDate || null,
            visibility: merged.visibility || (merged.private ? "private" : "public"),
            itinerary: merged.itinerary || [],
            media: merged.media || [],
            notes: merged.notes || merged.notes || null,
            destination: merged.destination || merged.dest || null,
            startLocation: merged.startLocation || merged.start_location || null,
            updatedAt: new Date().toISOString(),
          };
          // Clean undefined values
          Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
          await updateDoc(docRef, payload);
          // optimistic local apply
          applyLocalEdit({ trip_id: merged.trip_id, ...payload });
        } catch (err) {
          console.error("[Travel] save edit to Firestore failed:", err);
          // still apply locally to avoid data loss
          applyLocalEdit(merged);
          setToast({ msg: "Saved locally (failed to sync)", type: "warning" });
          setTimeout(() => setToast(null), 2000);
        }
      } else {
        // local-only apply
        applyLocalEdit(merged);
      }

      setShowEditModal(false);
      setTripToEdit(null);
      setToast({ msg: "Trip updated", type: "success" });
      setTimeout(() => setToast(null), 1600);
    } finally {
      setSavingEdit(false);
    }
  }

  const openEditModal = (t) => {
    if (!t) return;
    const isOwner = user && (t.ownerId === user.uid || t.owner_id === user.uid);
    if (!isOwner) {
      setToast({ msg: "You don't have permission to edit this trip", type: "warning" });
      setTimeout(() => setToast(null), 2000);
      return;
    }
    setTripToEdit(t);
    setShowEditModal(true);
  };

  function applyLocalEdit(updated) {
    if (!updated || !updated.trip_id) return;
    // update selectedTrip if it's the one
    if (selectedTripId === updated.trip_id) {
      const merged = { ...selectedTrip, ...updated };
      setSelectedTrip(merged);
      setTripTitle(merged.title || "");
      setTripStart(merged.start_date || "");
      setTripEnd(merged.end_date || "");
      setTripStartLocation(merged.startLocation || merged.start_location || "");
      setTripDestination(merged.destination || merged.dest || "");
      setTripNotes(merged.notes || "");
      // also sync internal itinerary state if provided
      if (Array.isArray(merged.itinerary)) setItinerary(merged.itinerary);
    }
    setSavedTrips((prev) => prev.map((t) => (t.trip_id === updated.trip_id ? { ...t, ...updated } : t)));
  }

  /* ---------- tracking & media controls (unchanged) ---------- */
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported by your browser");
      return;
    }
    if (watchIdRef.current) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp };
        setPosition(coords);
      },
      (err) => {
        console.error("geolocation error", err);
        alert("Geolocation error: " + err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const handleMediaSelected = (e) => {
    const files = Array.from(e.target.files || []);
    const newItems = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: file.type.startsWith("video") ? "video" : "image",
      url: URL.createObjectURL(file),
      name: file.name,
      date: new Date().toISOString(),
      file,
    }));
    setMedia((m) => [...newItems, ...m]);
  };

  const removeMedia = (id) => setMedia((m) => m.filter((x) => x.id !== id));
  async function startBroadcast() {
    if (isBroadcasting) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      pc.onicecandidate = () => { };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setIsBroadcasting(true);
    } catch (e) {
      console.error("startBroadcast error", e);
      alert("Unable to access camera/mic: " + (e.message || e));
    }
  }
  function stopBroadcast() {
    setIsBroadcasting(false);
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach((s) => s.track?.stop());
        pcRef.current.close();
      } catch (e) { }
      pcRef.current = null;
    }
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      localVideoRef.current.srcObject = null;
    }
  }
  async function saveYouTubeToTrip() {
    if (!selectedTrip || !selectedTrip.trip_id) {
      setToast && setToast({ msg: "Select a trip first", type: "warning" });
      setTimeout(() => setToast && setToast(null), 1400);
      return;
    }

    const id = extractYouTubeId(youtubeInput || selectedTrip.youtubeId || "");
    if (!id) {
      setToast && setToast({ msg: "Paste a valid YouTube watch/embed URL or iframe", type: "warning" });
      setTimeout(() => setToast && setToast(null), 1800);
      return;
    }

    setSavingYouTube(true);
    try {
      const isOwner = user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid);

      if (isOwner && useFirebase && db) {
        try {
          const dr = doc(db, "trips", selectedTrip.trip_id);
          await updateDoc(dr, { youtubeId: id, updatedAt: new Date().toISOString() });
          applyLocalEdit && applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: id, updated_at: new Date().toISOString() });
          setToast && setToast({ msg: "YouTube link saved", type: "success" });
          setTimeout(() => setToast && setToast(null), 1400);
        } catch (err) {
          console.error("saveYouTubeToTrip (firestore) failed:", err);
          applyLocalEdit && applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: id });
          setToast && setToast({ msg: "Saved locally (failed to sync)", type: "warning" });
          setTimeout(() => setToast && setToast(null), 1800);
        }
      } else {
        // local-only
        applyLocalEdit && applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: id });
        setToast && setToast({ msg: "Saved locally (not persisted)", type: "info" });
        setTimeout(() => setToast && setToast(null), 1400);
      }

      // keep input synced to the saved id
      setYoutubeInput(`https://www.youtube.com/watch?v=${id}`);
    } finally {
      setSavingYouTube(false);
    }
  }

  function openYoutubeModal(prefill = "") {
    // prefill input from selectedTrip or explicit prefill
    if (prefill) setYoutubeInput(prefill);
    else if (selectedTrip?.youtubeId) setYoutubeInput(`https://www.youtube.com/watch?v=${selectedTrip.youtubeId}`);
    else setYoutubeInput("");
    setShowYoutubeModal(true);
  }

  // ---------- permissions helper ----------
  const canEditItinerary = useMemo(() => {
    return Boolean(
      // editing allowed if not in public view (local owner/editor)
      !isPublicView ||
      // or signed-in user is the resolved profile owner, or the selected trip owner
      (user && (
        (resolvedUid && user.uid === resolvedUid) ||
        (selectedTrip && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid))
      ))
    );
  }, [isPublicView, user, resolvedUid, selectedTrip]);

  /* ---------- UI helpers ---------- */
  const loadTrip = (t) => {
    if (!t) return;
    setSelectedTrip(t); // <-- IMPORTANT: set the whole object for header visibility icon, notes, etc.
    setSelectedTripId(t.trip_id);
    setTripTitle(t.title || "");
    setTripStart(t.start_date || t.startDate || "");
    setTripEnd(t.end_date || t.endDate || "");
    setTripPrivate(!!t.private);
    setItinerary(t.itinerary || []);
    setTripStartLocation(t.startLocation || t.start_location || "");
    setTripDestination(t.destination || t.dest || "");
    setTripNotes(t.notes || "");
    setMedia((t.media || []).map((x) => ({
      id: x.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: x.type || "image",
      url: x.storageUrl || x.url || "",
      name: x.name || "",
      date: x.date || new Date().toISOString(),
    })));
    if (t.last_position) setPosition(t.last_position);
  };


  /* ---------- render ---------- */
  if (profileLoading) {
    return (
      <div className="travel-container" style={{ padding: 24 }}>
        <h2>Loading profile…</h2>
        <p className="muted">handle: @{normalizeHandle(routeHandle)}</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="travel-container" style={{ padding: 24 }}>
        <h2>No user found for @{normalizeHandle(routeHandle)}</h2>
        <p className="muted">Make sure the handle is correct and exists in Firestore.</p>
      </div>
    );
  }

  return (
    <div className="travel-container">
      <header className="travel-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ minWidth: 0 }}>
            {/* Title: prefer selected trip title when a trip is loaded */}
            <h1 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{selectedTripId ? (tripTitle || "Trip Title") : (isPublicView ? (profile?.displayName || "Profile") : (tripTitle ? `${tripTitle} — Live` : "Untitled Trip — Live"))}</span>

              {selectedTrip && (
                <span title={getVisibilityInfo(selectedTrip, user).label} style={{ fontSize: 16, opacity: 0.9 }}>
                  {getVisibilityInfo(selectedTrip, user).icon}
                </span>
              )}
            </h1>


            {selectedTripId ? (
              <>
                {/* compact trip meta line */}
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  @{profile?.handle ?? profile?.displayName?.toLowerCase()?.replace(/\s+/g, "")}
                  {tripStartLocation || tripDestination ? ` · ${tripStartLocation || "—"} → ${tripDestination || "—"}` : ""}
                  {(tripStart || tripEnd) ? ` · ${tripStart}${tripEnd ? ` → ${tripEnd}` : ""}` : ""}
                </div>

                {/* notes snippet */}
                {tripNotes && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {tripNotes}
                  </div>

                )}
              </>
            ) : (
              isPublicView ? (
                <div className="muted" style={{ fontSize: 13 }}>{profile?.bio}</div>
              ) : (
                <>
                  <div className="muted" style={{ fontSize: 13 }}>{tripStart} {tripEnd ? `→ ${tripEnd}` : ""}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{useFirebase ? (firebaseReady ? "Connected to Firebase" : "Connecting...") : "Local-only mode (no Firebase configured)"}</div>
                </>
              )
            )}

          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isPublicView && (
              <>
                <button onClick={startTracking} className="btn-start">Start tracking</button>
                <button onClick={stopTracking} className="btn-stop">Stop</button>
                <button onClick={() => { /* saveTrip implementation */ }} className="btn-start">Save Trip Details</button>
              </>
            )}

            <button onClick={() => { /* exportTrips implementation */ }} className="btn-export">Export all</button>
            {isPublicView && <button onClick={() => { /* shareProfile implementation */ }} className="btn-start">Share profile</button>}


            {/* Edit Trip button (owner-only) */}
            {selectedTrip && user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid) && (
              <button
                onClick={() => openEditModal(selectedTrip)}
                className="btn-secondary"
                title="Edit this trip"
                style={{ marginLeft: 6 }}
              >
                Edit Trip
              </button>
            )}
          </div>


        </div>
      </header>


      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18, marginTop: 16 }}>
        <aside style={{ minHeight: 320 }}>
          <div className="section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Trips</h3>
              <div className="muted" style={{ fontSize: 13 }}>{savedTrips.length}</div>
            </div>
            <div style={{ marginTop: 8 }}>
              {savedTrips.length === 0 && <div className="muted">No saved trips.</div>}
              <ul className="saved-trip-list">
                {savedTrips.map((t) => {
                  const isOwner = user && (t.ownerId === user.uid || t.owner_id === user.uid);
                  const visibility = t.visibility || (t.private ? "private" : "public");
                  // Determine icon and tooltip
                  let icon = "🔒";
                  let iconTitle = "Private (owner only)";
                  if (visibility === "public") {
                    icon = "🌐";
                    iconTitle = "Public";
                  } else if (visibility === "private" && !isOwner) {
                    // If private but current user is in allowedUsers, show restricted icon
                    if (Array.isArray(t.allowedUsers) && user && t.allowedUsers.includes(user.uid)) {
                      icon = "🔑";
                      iconTitle = "Restricted (you have access)";
                    } else {
                      icon = "🔒";
                      iconTitle = "Private";
                    }
                  } else if (visibility === "private" && isOwner) {
                    icon = "🔒";
                    iconTitle = "Private (you own this)";
                  }

                  return (
                    <li
                      key={t.trip_id}
                      className={`saved-trip ${selectedTripId === t.trip_id ? "active" : ""} compact`}
                      onClick={() => loadTrip(t)}
                      style={{ cursor: 'pointer', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.startLocation || '—'}{t.destination ? ` → ${t.destination}` : ''}
                        </div>
                      </div>

                      <div style={{ marginLeft: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* visibility icon */}
                        <div title={iconTitle} aria-label={`visibility: ${iconTitle}`} style={{ fontSize: 18, opacity: 0.95 }}>
                          {icon}
                        </div>

                        {!isPublicView && (
                          <>
                            {isOwner && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditModal(t); }}
                                className="btn-small btn-secondary"
                                title="Edit trip"
                                style={{ marginLeft: 6 }}
                              >
                                Edit
                              </button>
                            )}

                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ open: true, id: t.trip_id }); }}
                              className="btn-small btn-danger"
                              title="Delete trip"
                            >
                              Del
                            </button>
                          </>
                        )}

                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="section" style={{ marginTop: 12 }}>
            <h4>Storage</h4>
            <p className="muted" style={{ fontSize: 13 }}>Trips are stored in {useFirebase ? "Firebase Firestore (per-user)" : "your app's memory"}.</p>
          </div>
        </aside>

        {/* RIGHT PANEL: show only when owner OR a trip is selected for viewing */}
        {(!isPublicView || Boolean(selectedTripId)) ? (
          <main>
            {/* Show Google embed if present on the selected trip, otherwise fall back to live map / message */}
            {(selectedTrip && selectedTrip.googleEmbed) ? (
              <GoogleEmbedMap embedHtmlOrUrl={selectedTrip.googleEmbed} height={340} />
            ) : (
              <div className="map-box section" style={{ height: 340, position: "relative", cursor: "default" }}>
                {position ? (
                  <MapContainer center={[position.lat, position.lng]} zoom={11} style={{ height: "100%", borderRadius: 8 }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[position.lat, position.lng]}>
                      <Popup>
                        Current location<br />
                        {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                      </Popup>
                    </Marker>
                  </MapContainer>
                ) : (
                  // clickable overlay when there's no GPS fix
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      // open modal to paste Google map embed (only if a trip is selected)
                      if (!selectedTrip) {
                        setToast({ msg: "Select or create a trip first", type: "warning" });
                        setTimeout(() => setToast(null), 2000);
                        return;
                      }
                      // prefill input with any existing embed
                      setGoogleEmbedInput(selectedTrip?.googleEmbed || "");
                      setShowEmbedModal(true);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); } }}
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      gap: 10,
                      padding: 16,
                      textAlign: "center",
                      borderRadius: 8,
                      cursor: "pointer",
                      userSelect: "none"
                    }}
                    title="Click to add a Google map for this trip"
                    aria-label="Add Google map embed for this trip"
                  >
                    <div className="muted" style={{ fontSize: 15 }}>
                      No GPS fix yet — click "Start tracking"
                    </div>

                    <div style={{ fontSize: 13, color: "#666", maxWidth: 420 }}>
                      Want to show a custom map instead? Click here to paste a Google Maps / My Maps embed URL or iframe.
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowEmbedModal(true); setGoogleEmbedInput(selectedTrip?.googleEmbed || ""); }}
                        className="btn-start"
                        aria-label="Open map embed dialog"
                      >
                        Add / Paste Google map
                      </button>

                      {/* small inline hint for owners */}
                      {selectedTrip && (!isPublicView || (user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid))) && (
                        <div style={{ alignSelf: "center", fontSize: 13, color: "#666" }}>Owners can save a map for this trip</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}


            <div style={{ display: "flex", gap: 20, marginTop: 18, flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 320 }}>
                {/* Merged Live / View UI (replace old Live Stream block with this) */}
                {/* Simplified Live Video block: single video area or message */}
                {/* Simplified Live Video block with owner button */}
                <section className="section">
                  <h2>Live Video</h2>

                  <div style={{ marginTop: 12 }}>
                    {selectedTrip?.youtubeId ? (
                      <div style={{ height: 340 }}>
                        <iframe
                          title="YouTube Live"
                          src={`https://www.youtube.com/embed/${selectedTrip.youtubeId}?autoplay=1`}
                          width="100%"
                          height="100%"
                          style={{ border: 0 }}
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div
                        className="map-box section"
                        style={{
                          height: 340,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          padding: 16,
                          cursor: isOwner ? "pointer" : "default",
                          userSelect: "none",
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (isOwner) openYoutubeModal(selectedTrip?.youtubeId ? `https://www.youtube.com/watch?v=${selectedTrip.youtubeId}` : ""); }}
                        onKeyDown={(e) => { if (isOwner && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openYoutubeModal(selectedTrip?.youtubeId ? `https://www.youtube.com/watch?v=${selectedTrip.youtubeId}` : ""); } }}
                        aria-label="Attach YouTube live link"
                        title={isOwner ? "Attach YouTube live link" : "No live feed attached"}
                      >
                        <div style={{ maxWidth: 480 }}>
                          <div style={{ fontSize: 16 }} className="muted">No live feed attached</div>
                          <div style={{ marginTop: 8, color: "#666" }}>
                            {isOwner ? "Attach a YouTube watch URL or iframe to this trip to show a live stream." : "Owner hasn't attached a live stream yet."}
                          </div>

                          {isOwner && (
                            <div style={{ marginTop: 14 }}>
                              <button
                                className="btn-start"
                                onClick={(e) => { e.stopPropagation(); openYoutubeModal(selectedTrip?.youtubeId ? `https://www.youtube.com/watch?v=${selectedTrip.youtubeId}` : ""); }}
                              >
                                Attach YouTube link
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>




                <section className="section">
                  <h2>Gallery (Photos & Videos)</h2>
                  {!isPublicView && <input type="file" accept="image/*,video/*" multiple onChange={handleMediaSelected} />}
                  <div className="gallery" style={{ marginTop: 12 }}>
                    {media.map((m) => (
                      <div key={m.id} className="gallery-item">
                        {m.type === "image" ? <img src={m.url} alt={m.name} /> : <video src={m.url} controls className="media-preview" />}
                        <div className="info">
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{m.name}</div>
                          {!isPublicView && <button onClick={() => removeMedia(m.id)} className="btn-link-danger">Remove</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside style={{ flex: 1, minWidth: 260 }}>
                <div className="section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3>Itinerary</h3>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canEditItinerary && (
                        <button
                          onClick={() => setShowItineraryModal(true)}
                          className="btn-start"
                          style={{ fontSize: "14px", padding: "4px 10px" }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>


                  <ul className="itinerary" style={{ marginTop: 12 }}>
                    {itinerary.length === 0 && <li className="muted">No itinerary items yet.</li>}
                    {itinerary.map((it, idx) => (
                      <li
                        key={it.id || idx}
                        style={{
                          marginBottom: 8,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div className="place">Day {it.day || idx + 1}: {it.route || it.place}</div>
                          {it.distance && <div className="date">{it.distance}</div>}
                          {it.notes && <div className="notes">{it.notes}</div>}
                        </div>

                        {canEditItinerary && (
                          <div style={{ marginLeft: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); confirmDeleteItinerary(it.id || null, it.route || `Day ${idx + 1}`); }}
                              className="btn-icon"
                              title="Delete itinerary item"
                              aria-label="Delete itinerary item"
                            >
                              {/* trash icon SVG (16x16) */}
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                                <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>

                          </div>
                        )}
                      </li>
                    ))}

                  </ul>
                </div>
              </aside>
            </div>
          </main>
        ) : (
          <div className="section" style={{ minHeight: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", maxWidth: 460 }}>
              <h2 style={{ marginBottom: 10, fontSize: "1.5rem", fontWeight: 600 }}>
                {isPublicView ? "Select a trip to view" : "No trip selected"}
              </h2>
              <p
                className="muted"
                style={{
                  marginBottom: 20,
                  fontSize: 15,
                  lineHeight: 1.5,
                  maxWidth: 400,
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                {isPublicView
                  ? "This profile has trips on the left. Pick one to load its map, live stream, gallery and itinerary."
                  : "Pick a trip from the list on the left or create a new trip to begin tracking and broadcasting."}
              </p>

              {!isPublicView && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button className="btn-start" onClick={() => createLocalTrip({ title: "My New Trip" })}>
                    Create new trip
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showItineraryModal && (
        // show trip title in modal header for clarity (fallback to selectedTrip.title or tripTitle)
        <Modal title={`Add Itinerary — ${selectedTrip?.title || tripTitle || "Untitled Trip"}`} onClose={() => setShowItineraryModal(false)}>
          <AddItineraryForm
            tripTitle={selectedTrip?.title || tripTitle || "Untitled Trip"}
            onAdd={(item) => { addItinerary(item); setShowItineraryModal(false); }}
            onCancel={() => setShowItineraryModal(false)}
          />
        </Modal>
      )}

      {/* Edit trip modal (owner only) */}
      {showEditModal && tripToEdit && (
        <EditTripModal
          trip={tripToEdit}
          open={showEditModal}
          saving={savingEdit}
          onCancel={() => {
            setShowEditModal(false);
            setTripToEdit(null);
          }}
          onSave={handleSaveEdit}
        />
      )}

      {/* Google Embed Modal (open when user clicks the no-gps area or Save map in header) */}
      {showEmbedModal && (
        <Modal title={`Add Google Map — ${selectedTrip?.title || "Trip"}`} onClose={() => setShowEmbedModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
            <div style={{ fontSize: 13, color: "#555" }}>Paste the iframe HTML or the embed URL from Google My Maps / Google Maps:</div>
            <input
              placeholder={`Paste iframe or src URL (e.g. <iframe src="..."> or https://www.google.com/maps/d/.../embed)`}
              value={googleEmbedInput}
              onChange={(e) => setGoogleEmbedInput(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", fontSize: 14 }}
            />

            {/* preview area if the input yields a src */}
            {extractEmbedSrc(googleEmbedInput) ? (
              <div style={{ border: "1px solid #eee", borderRadius: 6, overflow: "hidden", height: 200 }}>
                <iframe
                  title="Map preview"
                  src={extractEmbedSrc(googleEmbedInput)}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                Paste a Google My Maps embed iframe or a Google Maps embed URL to see a preview here.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-cancel" onClick={() => setShowEmbedModal(false)}>Cancel</button>
              <button
                className="btn-start"
                onClick={async () => {
                  // call your existing save helper
                  await saveGoogleEmbedForSelectedTrip();
                  setShowEmbedModal(false);
                }}
              >
                Save map
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete.open && (
        <Modal title="Delete Trip?" onClose={() => setConfirmDelete({ open: false, id: null })}>
          <p>Delete this trip permanently from storage?</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn-danger" onClick={() => deleteTripConfirm(confirmDelete.id)}>Delete</button>
            <button className="btn-cancel" onClick={() => setConfirmDelete({ open: false, id: null })}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Confirm delete itinerary item modal */}
      {confirmItin.open && (
        <Modal title="Delete itinerary item?" onClose={() => setConfirmItin({ open: false, id: null, title: null })}>
          <p>Are you sure you want to delete <strong>{confirmItin.title || "this item"}</strong> from the itinerary? This action cannot be undone.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn-danger" onClick={confirmDeleteItineraryConfirmed}>Delete</button>
            <button className="btn-cancel" onClick={() => setConfirmItin({ open: false, id: null, title: null })}>Cancel</button>
          </div>
        </Modal>
      )}

      {confirmRemoveYoutube && (
        <Modal title="Remove YouTube link?" onClose={() => setConfirmRemoveYoutube(false)}>
          <p>Are you sure you want to remove the attached YouTube live link from this trip?</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="btn-danger"
              onClick={() => {
                clearYouTubeFromTrip(); // run your removal logic
                setConfirmRemoveYoutube(false);
              }}
            >
              Remove
            </button>
            <button className="btn-cancel" onClick={() => setConfirmRemoveYoutube(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {showYoutubeModal && (
        <Modal title={`Attach YouTube Live — ${selectedTrip?.title || "Trip"}`} onClose={() => setShowYoutubeModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
            <div style={{ fontSize: 13, color: "#555" }}>Paste the YouTube watch URL (https://www.youtube.com/watch?v=...) or an iframe embed code:</div>
            <input
              placeholder={`Paste YouTube watch link or iframe (e.g. <iframe src="https://www.youtube.com/embed/..." />)`}
              value={youtubeInput}
              onChange={(e) => setYoutubeInput(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", fontSize: 14 }}
            />

            {/* preview if we can extract an id */}
            {extractYouTubeId(youtubeInput) ? (
              <div style={{ border: "1px solid #eee", borderRadius: 6, overflow: "hidden", height: 200 }}>
                <iframe
                  title="YouTube preview"
                  src={`https://www.youtube.com/embed/${extractYouTubeId(youtubeInput)}?autoplay=1`}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                Paste a YouTube watch URL or iframe to see a preview here.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-cancel" onClick={() => setShowYoutubeModal(false)}>Cancel</button>
              <button
                className="btn-start"
                onClick={async () => {
                  await saveYouTubeToTrip();
                  setShowYoutubeModal(false);
                }}
                disabled={savingYouTube}
              >
                {savingYouTube ? "Saving..." : "Save to trip"}
              </button>
            </div>
          </div>
        </Modal>
      )}


    </div>
  );
}

/* ---------- AddItineraryForm (updated to show trip title) ---------- */
function AddItineraryForm({ onAdd, onCancel, tripTitle }) {
  const [day, setDay] = useState("");
  const [route, setRoute] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!route) return;
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      day: day || String(Date.now()).slice(-4),
      route,
      distance,
      notes,
      date: new Date().toISOString(),
    });
    setDay("");
    setRoute("");
    setDistance("");
    setNotes("");
  };

  return (
    <div>
      {/* Visible trip title inside modal so user knows which trip they're editing */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>Adding itinerary for</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{tripTitle}</div>
      </div>

      <form onSubmit={submit} className="itinerary-form">
        <input placeholder="Day Number" value={day} onChange={(e) => setDay(e.target.value)} />
        <input placeholder="Route (e.g., Raipur → Delhi)" value={route} onChange={(e) => setRoute(e.target.value)} />
        <input placeholder="Distance (e.g., 1,220 km)" value={distance} onChange={(e) => setDistance(e.target.value)} />
        <textarea placeholder="Notes (stops, sightseeing, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-save">Save</button>
        </div>
      </form>
    </div>
  );
}
