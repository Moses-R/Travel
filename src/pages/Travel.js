// src/pages/Travel.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import "./css/Travel.css";
import Modal from "../components/Modal";
import EditTripModal from "../components/EditTripModal";
import { useParams, useNavigate } from "react-router-dom";
import { normalizeHandle } from "../utils/handle";
import TripsList, { isTripActive, formatDateForUI, parseDateToMs, toMillis } from "../components/TripList";
import MapPanel, { extractEmbedSrc } from "../components/MapPanel";
import LiveVideoPanel from "../components/LiveVideoPanel";
import ItineraryPanel, { AddItineraryForm } from "../components/ItineraryPanel";
import GalleryPanel, { uploadAndSaveMedia } from "../components/GalleryPanel";
import { safeShare } from "../utils/share";
import LiveLocationPanel from '../components/LiveLocationPanel';

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
  arrayUnion,
  arrayRemove,
  updateDoc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import bikeGif from "../assets/bike-running.gif";

import { firebaseApp, auth, db, storage, isFirebaseConfigured } from "../firebase";

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
function slugify(text = "") {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
// Resolve a handle (without @) -> uid using the handles collection (normalized)
const resolveHandleToUidLocal = async (handleNoAt) => {
  try {
    if (!db || !handleNoAt) return null;
    const key = normalizeHandle(String(handleNoAt || ""));
    if (!key) return null;

    // preferred: doc id on `handles`
    const hSnap = await getDoc(doc(db, "handles", key));
    if (hSnap && typeof hSnap.exists === "function" ? hSnap.exists() : !!hSnap.exists) {
      const d = hSnap.data();
      return d?.uid ?? d?.userId ?? d?.id ?? null;
    }

    // fallback: handles collection might store handle as a field
    const q = query(collection(db, "handles"), where("handle", "==", key));
    const snaps = await getDocs(q);
    if (snaps && !snaps.empty) {
      const d = snaps.docs[0].data();
      return d?.uid ?? d?.userId ?? d?.id ?? null;
    }

    // fallback: users collection may have the handle
    const q2 = query(collection(db, "users"), where("handle", "==", key), orderBy("createdAt", "desc"));
    const snaps2 = await getDocs(q2);
    if (snaps2 && !snaps2.empty) {
      const d = snaps2.docs[0].data();
      return d?.uid ?? d?.id ?? snaps2.docs[0].id ?? null;
    }
    return null;
  } catch (err) {
    console.error("resolveHandleToUidLocal error:", err);
    return null;
  }
};

// Resolve UID -> handle (prefer doc id in handles collection where uid == <uid>)
const resolveUidToHandleLocal = async (uid) => {
  try {
    if (!db || !uid) return null;

    // query handles where uid == uid
    const q = query(collection(db, "handles"), where("uid", "==", uid));
    const snaps = await getDocs(q);
    if (snaps && !snaps.empty) {
      // prefer doc id (common pattern: doc id = handle)
      const first = snaps.docs[0];
      if (first && first.id) return first.id;
      const d = first.data();
      return d?.handle ?? d?.name ?? null;
    }

    // fallback: users doc with id==uid might contain handle
    const uSnap = await getDoc(doc(db, "users", uid));
    if (uSnap && typeof uSnap.exists === "function" ? uSnap.exists() : !!uSnap.exists) {
      const data = uSnap.data();
      return data?.handle ?? data?.username ?? null;
    }

    // fallback: users where uid field equals uid
    const q2 = query(collection(db, "users"), where("uid", "==", uid));
    const snaps2 = await getDocs(q2);
    if (snaps2 && !snaps2.empty) {
      const d = snaps2.docs[0].data();
      return d?.handle ?? d?.username ?? null;
    }

    return null;
  } catch (err) {
    console.error("resolveUidToHandleLocal error:", err);
    return null;
  }
};


/* ---------- component ---------- */
export default function Travel({ externalHandle = null, externalSlug = null }) {
  const navigate = useNavigate();
  const params = useParams();
  let routeHandle = (params.handle || "").toString();

  // prefer externalHandle prop (from App) if provided
  if (externalHandle) {
    routeHandle = String(externalHandle || "");
  }

  // optional slug from url or prop
  const paramSlug = (params.slug || "").toString().replace(/^\/*|\/*$/g, "");
  let routeSlug = externalSlug || paramSlug || ""; // externalSlug prop takes precedence

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
  const pcRef = useRef(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
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
  const [followLoading, setFollowLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  // load trip by slug from Firestore and apply visibility checks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const slug = (routeSlug || "").toString().trim();
        if (!slug) return;

        if (!useFirebase || !db) {
          console.warn("[Travel] Firebase not configured; cannot load trip by slug");
          return;
        }

        // wait until resolvedUid exists (owner uid for the handle)
        if (!resolvedUid) return;

        // first try: trip owned by profile with this slug
        const tripsCol = collection(db, "trips");
        const qOwnerSlug = query(tripsCol, where("owner_id", "==", resolvedUid), where("slug", "==", slug));
        const snaps = await getDocs(qOwnerSlug);
        if (cancelled) return;

        let tripDoc = null;
        if (snaps && !snaps.empty) {
          const d = snaps.docs[0];
          tripDoc = { trip_id: d.id, ...d.data() };
        } else {
          // fallback: any trip with that slug
          const qAnySlug = query(tripsCol, where("slug", "==", slug));
          const snapsAny = await getDocs(qAnySlug);
          if (cancelled) return;
          if (snapsAny && !snapsAny.empty) {
            const d = snapsAny.docs[0];
            tripDoc = { trip_id: d.id, ...d.data() };
          }
        }

        if (!tripDoc) {
          if (!cancelled) setNotFound(true);
          return;
        }

        const visibility = tripDoc.visibility || (tripDoc.private ? "private" : "public");
        const ownerId = tripDoc.owner_id || tripDoc.ownerId || null;
        const allowedUsers = Array.isArray(tripDoc.allowedUsers) ? tripDoc.allowedUsers : (tripDoc.allowed_users || []);

        const isOwnerLocal = user && ownerId && user.uid === ownerId;
        const isAllowed = user && ownerId && Array.isArray(allowedUsers) && allowedUsers.includes(user.uid);

        if (visibility === "private" && !isOwnerLocal && !isAllowed) {
          if (!cancelled) {
            setNotFound(true);
            setToast({ msg: "This trip is private", type: "warning" });
            setTimeout(() => setToast(null), 2000);
          }
          return;
        }

        if (!cancelled) {
          const normalized = {
            trip_id: tripDoc.trip_id || tripDoc.id || tripDoc.tripId || `trip_local_${Date.now()}`,
            title: tripDoc.title || tripDoc.name || tripDoc.slug || "Untitled Trip",
            start_date: tripDoc.startDate || tripDoc.start_date || "",
            end_date: tripDoc.endDate || tripDoc.end_date || null,
            private: (tripDoc.visibility === "private") || !!tripDoc.private,
            itinerary: tripDoc.itinerary || [],
            media: tripDoc.media || [],
            last_position: tripDoc.last_position || tripDoc.lastPosition || null,
            created_at: tripDoc.createdAt || tripDoc.created_at || new Date().toISOString(),
            ownerId: ownerId,
            visibility: visibility,
            allowedUsers: allowedUsers,
            ...tripDoc,
          };

          setSelectedTripId(normalized.trip_id);
          setSelectedTrip(normalized);
          setTripTitle(normalized.title || "");
          setTripStart(normalized.start_date || "");
          setTripEnd(normalized.end_date || "");
          setTripPrivate(!!normalized.private);
          setItinerary(Array.isArray(normalized.itinerary) ? normalized.itinerary : []);
          setTripStartLocation(normalized.startLocation || normalized.start_location || "");
          setTripDestination(normalized.destination || normalized.dest || "");
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

          // ensure URL matches (optional)
          try {
            const handlePart = normalizeHandle(profile?.handle || routeHandle || "");
            const basePath = handlePart ? `/Travel/@${handlePart}` : "/Travel";
            const slugToUse = normalized.slug || slugify(normalized.title || "") || normalized.trip_id;
            navigate(`${basePath}/${slugToUse}`, { replace: true });
          } catch (err) {
            // ignore navigation errors
          }
        }
      } catch (err) {
        console.error("[Travel] load trip by slug error:", err);
        if (!cancelled) setNotFound(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedUid, routeSlug, user, profile, useFirebase, db, navigate]); // include navigate

  useEffect(() => {
    if (!useFirebase || !db || !user || !resolvedUid) return;
    const followDoc = doc(db, "follows", `${user.uid}_${resolvedUid}`);
    const unsub = onSnapshot(followDoc, (snap) => {
      setIsFollowing(snap.exists());
    }, (err) => console.error("follow status snapshot failed", err));
    return () => unsub && unsub();
  }, [db, user, resolvedUid]);


  useEffect(() => {
    if (!useFirebase || !db || !resolvedUid) return;
    const q = query(collection(db, "follows"), where("followeeId", "==", resolvedUid));
    const unsub = onSnapshot(q, (snap) => {
      setFollowerCount(snap.size); // cheap for small counts; consider aggregation for large apps
    }, (err) => console.error("followers count snapshot failed", err));
    return () => unsub && unsub();
  }, [db, resolvedUid]);

  const isOwner = Boolean(user && selectedTrip && (user.uid === selectedTrip.ownerId || user.uid === selectedTrip.owner_id));

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

    const payload = { trip_id: selectedTrip.trip_id, googleEmbed: src };
    applyLocalEdit(payload);
    setSelectedTrip((s) => s ? { ...s, googleEmbed: src } : s);
    setToast({ msg: "Map embed applied", type: "success" });
    setTimeout(() => setToast(null), 1400);

    const ownerFlag = user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid);
    if (useFirebase && db && user && ownerFlag) {
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
      setToast({ msg: "Embed stored locally (not persisted)", type: "info" });
      setTimeout(() => setToast(null), 1400);
    }
  }

  // ---------- helper: visibility ----------
  function getVisibilityInfo(trip, user) {
    if (!trip) return { icon: "❓", label: "Unknown" };
    const visibility = trip.visibility || (trip.private ? "private" : "public");
    const isOwnerLocal = user && (trip.ownerId === user.uid || trip.owner_id === user.uid);

    if (visibility === "public") {
      return { icon: "🌐", label: "Public" };
    }

    if (visibility === "restricted") {
      if (isOwnerLocal) return { icon: "🔑", label: "Restricted (you own this)" };
      if (Array.isArray(trip.allowedUsers) && user && trip.allowedUsers.includes(user.uid)) {
        return { icon: "🔑", label: "Restricted (you have access)" };
      }
      return { icon: "🔑", label: "Restricted" };
    }

    if (visibility === "private") {
      if (isOwnerLocal) return { icon: "🔒", label: "Private (you own this)" };
      if (Array.isArray(trip.allowedUsers) && user && trip.allowedUsers.includes(user.uid)) {
        return { icon: "🔑", label: "Restricted (you have access)" };
      }
      return { icon: "🔒", label: "Private" };
    }

    return { icon: "❓", label: "Unknown" };
  }


  useEffect(() => {
    // mount debug
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
      // if a slug is present in the URL, try to auto-select the matching trip
      if (routeSlug) {
        try {
          const bySlug = arr.find(
            (t) =>
              (t.slug && t.slug === routeSlug) ||
              (t.slug && slugify(t.slug) === routeSlug) ||
              (t.title && slugify(t.title) === routeSlug) ||
              t.trip_id === routeSlug
          );
          if (bySlug) {
            // set selected trip (merge ensures consistent state)
            setSelectedTripId(bySlug.trip_id);
            setSelectedTrip(bySlug);
            setTripTitle(bySlug.title || "");
            setTripStart(bySlug.start_date || bySlug.startDate || "");
            setTripEnd(bySlug.end_date || bySlug.endDate || "");
            setTripPrivate(!!bySlug.private);
            setItinerary(bySlug.itinerary || []);
            setTripStartLocation(bySlug.startLocation || bySlug.start_location || "");
            setTripDestination(bySlug.destination || bySlug.dest || "");
            setTripNotes(bySlug.notes || "");
            setMedia(
              (bySlug.media || []).map((x) => ({
                id: x.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: x.type || "image",
                url: x.storageUrl || x.url || "",
                name: x.name || "",
                date: x.date || new Date().toISOString(),
              }))
            );
            if (bySlug.last_position) setPosition(bySlug.last_position);
          }
        } catch (err) {
          console.warn("[Travel] routeSlug auto-select failed:", err);
        }
      }


      try {
        if (selectedTripId) {
          const updated = tripsMap.get(selectedTripId);
          if (updated) {
            const merged = { ...(selectedTrip || {}), ...updated };
            setSelectedTrip(merged);

            setTripTitle(merged.title || "");
            setTripStart(merged.start_date || merged.startDate || "");
            setTripEnd(merged.end_date || merged.endDate || "");
            setTripPrivate(!!merged.private);
            setItinerary(Array.isArray(merged.itinerary) ? merged.itinerary : (itinerary || []));
            setTripStartLocation(merged.startLocation || merged.start_location || "");
            setTripDestination(merged.destination || merged.dest || "");
            setTripNotes(merged.notes || merged.notes || "");
            setMedia(
              (merged.media || []).map((x) => ({
                id: x.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: x.type || "image",
                url: x.storageUrl || x.url || "",
                name: x.name || "",
                date: x.date || new Date().toISOString(),
              }))
            );

            if (merged.last_position) setPosition(merged.last_position);
          } else {
            setSelectedTripId(null);
            setSelectedTrip(null);
          }
        }
      } catch (err) {
        console.warn("[Travel] pushSnapshotToMap: failed to sync selectedTrip", err);
      }

      try {
        if (!selectedTripId && arr.length > 0) {
          const now = Date.now();

          const candidates = arr
            .map((t) => {
              const startedFlag = !!t.started;
              const startedAtNum = t.startedAt ? Date.parse(t.startedAt) : (t.started_at ? Date.parse(t.started_at) : NaN);
              return { t, startedFlag, startedAtNum: Number.isFinite(startedAtNum) ? startedAtNum : (startedFlag ? 0 : NaN) };
            })
            .filter((x) => x.startedFlag || (Number.isFinite(x.startedAtNum) && x.startedAtNum <= now));

          if (candidates.length > 0) {
            candidates.sort((a, b) => (b.startedAtNum || 0) - (a.startedAtNum || 0));
            const chosen = candidates[0].t;

            setSelectedTripId(chosen.trip_id);
            setSelectedTrip(chosen);
            setTripTitle(chosen.title || "");
            setTripStart(chosen.start_date || chosen.startDate || "");
            setTripEnd(chosen.end_date || chosen.endDate || "");
            setTripPrivate(!!chosen.private);
            setItinerary(chosen.itinerary || []);
            setTripStartLocation(chosen.startLocation || chosen.start_location || "");
            setTripDestination(chosen.destination || chosen.dest || "");
            setTripNotes(chosen.notes || "");
            setMedia(
              (chosen.media || []).map((x) => ({
                id: x.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: x.type || "image",
                url: x.storageUrl || x.url || "",
                name: x.name || "",
                date: x.date || new Date().toISOString(),
              }))
            );
            if (chosen.last_position) setPosition(chosen.last_position);
          }
        }
      } catch (err) {
        console.warn("[Travel] auto-select started trip failed:", err);
      }
    };

    const setupSubscriptions = (currentUser) => {
      // clean up previous listeners if any
      if (tripsUnsub) {
        try { tripsUnsub(); } catch (e) { /* ignore */ }
      }
      tripsMap.clear();

      const unsubscribers = [];

      const ownerId = resolvedUid || (currentUser && currentUser.uid) || null;
      if (!ownerId) {
        // no owner to subscribe to -> clear UI
        setSavedTrips([]);
        tripsUnsub = null;
        return;
      }

      const isViewerOwner = currentUser && currentUser.uid === ownerId;

      // 1) Owner-all subscription (only for owner)
      if (isViewerOwner) {
        try {
          const qOwnerAll = query(
            collection(db, "trips"),
            where("owner_id", "==", ownerId),
            orderBy("createdAt", "desc")
          );

          const unsubOwnerAll = onSnapshot(
            qOwnerAll,
            (snap) => {
              try {
                const items = processSnapshot(snap);
                pushSnapshotToMap(items);
              } catch (err) {
                console.error("[Travel.qOwnerAll snapshot] processing error:", err);
              }
            },
            (err) => {
              if (err?.code === "permission-denied") {
                console.warn(
                  `[Travel] Permission denied while subscribing to owner-all trips for ownerId=${ownerId}.`
                );
                return;
              }
              console.error("[Travel] owner-all trips subscription failed:", err);
              setToast({ msg: "Failed to sync trips (owner-all)", type: "warning" });
              setTimeout(() => setToast(null), 2000);
            }
          );

          unsubscribers.push(unsubOwnerAll);
        } catch (err) {
          console.error("Failed to subscribe to owner-all trips", err);
        }
      }

      // 2) Public trips for this owner (always subscribe for non-owner viewers and anonymous)
      //    If viewer is the owner, this is redundant but harmless; we only add it when not owner to avoid duplication.
      if (!isViewerOwner) {
        try {
          const qPublic = query(
            collection(db, "trips"),
            where("owner_id", "==", ownerId),
            where("visibility", "==", "public"),
            orderBy("createdAt", "desc")
          );

          const unsubPublic = onSnapshot(
            qPublic,
            (snap) => {
              try {
                const items = processSnapshot(snap);
                pushSnapshotToMap(items);
              } catch (err) {
                console.error("[Travel.qPublic snapshot] processing error:", err);
              }
            },
            (err) => {
              if (err?.code === "permission-denied") {
                // public should normally be readable, but handle gracefully
                console.warn(`[Travel] Permission denied while subscribing to public trips for ownerId=${ownerId}.`);
                return;
              }
              console.error("[Travel] public trips subscription failed:", err);
              setToast({ msg: "Failed to sync public trips", type: "warning" });
              setTimeout(() => setToast(null), 2000);
            }
          );

          unsubscribers.push(unsubPublic);
        } catch (err) {
          console.error("Failed to subscribe to public trips", err);
        }
      }

      // 3) Allowed trips subscription (for viewers who are specifically allowed)
      if (!(currentUser && currentUser.uid === ownerId) && currentUser && currentUser.uid) {
        try {
          const qAllowed = query(
            collection(db, "trips"),
            where("owner_id", "==", ownerId),
            where("allowedUsers", "array-contains", currentUser.uid),
            orderBy("createdAt", "desc")
          );

          const unsubAllowed = onSnapshot(
            qAllowed,
            (snap) => {
              try {
                const items = processSnapshot(snap);
                pushSnapshotToMap(items);
              } catch (err) {
                console.error("[Travel.qAllowed snapshot] processing error:", err);
              }
            },
            (err) => {
              if (err?.code === "permission-denied") {
                console.warn(
                  `[Travel] Permission denied while subscribing to allowed trips for ownerId=${ownerId} (viewer=${currentUser?.uid}).`
                );
                return;
              }
              console.error("allowed trips onSnapshot error", err);
              setToast({ msg: "Failed to sync allowed trips", type: "warning" });
              setTimeout(() => setToast(null), 2000);
            }
          );

          unsubscribers.push(unsubAllowed);
        } catch (err) {
          console.error("Failed to subscribe to allowed trips", err);
        }
      }

      // Save a combined unsubscribe function
      tripsUnsub = () => {
        try {
          unsubscribers.forEach((u) => { try { u && u(); } catch (e) { /* ignore */ } });
        } catch (e) { /* ignore */ }
      };
    };

    (async () => {
      try {
        authUnsub = onAuthStateChanged(auth, (u) => {
          setUser(u || null);
          setFirebaseReady(true);
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

  /* ---------- trip:created event handler ---------- */
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
        if (detail.trip) {
          handleLoadedTripFromDoc(detail.trip);
          return;
        }

        const tripId = detail.trip_id || detail.id || null;
        const ownerHint = detail.owner_id || detail.ownerId || null;
        const visibilityHint = detail.visibility || null;

        let docData = null;

        if (useFirebase && user && tripId) {
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
            try {
              const dr = doc(db, "trips", tripId);
              const snap = await getDoc(dr);
              if (snap && snap.exists()) {
                docData = { trip_id: snap.id, ...snap.data() };
              }
            } catch (err) {
              console.warn("fetch created trip blocked by rules or not allowed:", err?.message || err);
            }
          }
        }

        if (!docData) {
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

  // create a local trip by dispatching `trip:created` event
  const createLocalTrip = (overrides = {}) => {
    const title = overrides.title || "New Trip";
    const computedSlug = overrides.slug || slugify(title) || localUid("slug");
    const detail = {
      trip_id: localUid(),
      title,
      slug: computedSlug,
      start_date: normalizeDate(new Date()),
      end_date: null,
      itinerary: [],
      media: [],
      last_position: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
    window.dispatchEvent(new CustomEvent("trip:created", { detail }));

    // update URL to reflect the created trip
    try {
      const handlePart = normalizeHandle(profile?.handle || routeHandle || "");
      const basePath = handlePart ? `/Travel/@${handlePart}` : "/Travel";
      navigate(`${basePath}/${detail.slug}`, { replace: true });
    } catch (err) {
      // ignore
    }
  };

  // ---------- NEW: save itinerary to Firestore helper ----------
  async function saveItineraryForTrip(tripId, newItinerary) {
    if (!useFirebase || !db) {
      return { ok: false, reason: "no-firebase" };
    }
    if (!tripId) return { ok: false, reason: "no-trip-id" };
    try {
      const docRef = doc(db, "trips", tripId);
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

  // perform confirmed delete
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
    setItinerary((prev) => {
      const arr = [...(Array.isArray(prev) ? prev : [])];
      arr.push(item);
      return arr;
    });

    const tripId = selectedTrip?.trip_id || selectedTripId;
    const isOwnerLocal = user && (selectedTrip?.ownerId === user.uid || selectedTrip?.owner_id === user.uid);
    if (useFirebase && db && tripId && isOwnerLocal) {
      try {
        const base = Array.isArray(selectedTrip?.itinerary) ? [...selectedTrip.itinerary] : Array.isArray(itinerary) ? [...itinerary] : [];
        const newIt = [...base, item];
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
      setSelectedTrip((s) => s ? { ...s, itinerary: [...(s.itinerary || []), item] } : s);
      setToast({ msg: "Added to local itinerary", type: "info" });
      setTimeout(() => setToast(null), 1500);
    }
  };

  // ---------- delete itinerary item ----------
  const deleteItineraryItem = async (itemId) => {
    if (!itemId) return;
    setItinerary((prev) => (Array.isArray(prev) ? prev.filter((it) => it.id !== itemId) : prev));

    const tripId = selectedTrip?.trip_id || selectedTripId;
    const isOwnerLocal = user && (selectedTrip?.ownerId === user.uid || selectedTrip?.owner_id === user.uid);

    if (useFirebase && db && tripId && isOwnerLocal) {
      try {
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
      setSelectedTrip(null);
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
        const needUpload = merged.media.some((m) => m && m.file);
        if (needUpload && useFirebase && user) {
          // NOTE: uploadAndSaveMedia was moved to GalleryPanel and exported
          merged.media = await uploadAndSaveMedia(merged.media, merged.trip_id, user);
        }
      }

      // Persist to Firestore if configured and owner
      const isOwnerLocal = user && (merged.ownerId === user.uid || merged.owner_id === user.uid);
      if (useFirebase && user && isOwnerLocal) {
        try {
          const docRef = doc(db, "trips", merged.trip_id);
          // inside handleSaveEdit, replace the payload object creation with this:

          const payload = {
            title: merged.title,
            slug: merged.slug || slugify(merged.title || "") || undefined,
            startDate: merged.start_date || merged.startDate || null,
            endDate: merged.end_date || merged.endDate || null,
            visibility: merged.visibility || (merged.private ? "private" : "public"),
            itinerary: merged.itinerary || [],
            media: merged.media || [],
            notes: merged.notes || merged.notes || null,
            destination: merged.destination || merged.dest || null,
            startLocation: merged.startLocation || merged.start_location || null,
            // --- NEW: persist allowedUsers properly when visibility is restricted ---
            allowedUsers:
              (merged.visibility || (merged.private ? "private" : "public")) === "restricted"
                ? // accept merged.allowedUsers if present, or empty array otherwise
                (Array.isArray(merged.allowedUsers) ? merged.allowedUsers.slice() : [])
                : [],
            updatedAt: new Date().toISOString(),
          };

          // Ensure owner uid is present in allowedUsers for restricted visibility
          if (payload.visibility === "restricted") {
            try {
              const ownerId = merged.ownerId || merged.owner_id || user?.uid || null;
              if (ownerId) {
                const set = new Set(Array.isArray(payload.allowedUsers) ? payload.allowedUsers : []);
                set.add(ownerId);
                payload.allowedUsers = Array.from(set);
              }
            } catch (err) {
              // ignore - owner add is a best-effort safety net
            }
          }

          Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
          await updateDoc(docRef, payload);
          applyLocalEdit({ trip_id: merged.trip_id, ...payload });
        } catch (err) {
          console.error("[Travel] save edit to Firestore failed:", err);
          applyLocalEdit(merged);
          setToast({ msg: "Saved locally (failed to sync)", type: "warning" });
          setTimeout(() => setToast(null), 2000);
        }
      } else {
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
    const isOwnerLocal = user && (t.ownerId === user.uid || t.owner_id === user.uid);
    if (!isOwnerLocal) {
      setToast({ msg: "You don't have permission to edit this trip", type: "warning" });
      setTimeout(() => setToast(null), 2000);
      return;
    }
    setTripToEdit(t);
    setShowEditModal(true);
  };

  function applyLocalEdit(updated) {
    if (!updated || !updated.trip_id) return;
    if (selectedTripId === updated.trip_id) {
      const merged = { ...selectedTrip, ...updated };
      setSelectedTrip(merged);
      setTripTitle(merged.title || "");
      setTripStart(merged.start_date || "");
      setTripEnd(merged.end_date || "");
      setTripStartLocation(merged.startLocation || merged.start_location || "");
      setTripDestination(merged.destination || merged.dest || "");
      setTripNotes(merged.notes || "");
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

  // ---------- permissions helper ----------
  const canEditItinerary = useMemo(() => {
    return Boolean(
      !isPublicView ||
      (user && (
        (resolvedUid && user.uid === resolvedUid) ||
        (selectedTrip && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid))
      ))
    );
  }, [isPublicView, user, resolvedUid, selectedTrip]);

  /* ---------- UI helpers ---------- */
  const loadTrip = (t) => {
    if (!t) return;

    setSelectedTrip(t);
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

    // push slug to URL
    try {
      const slug = t.slug || (t.title ? slugify(t.title) : t.trip_id);
      const handlePart = normalizeHandle(profile?.handle || routeHandle || "");
      const basePath = handlePart ? `/Travel/@${handlePart}` : "/Travel";
      navigate(`${basePath}/${slug}`, { replace: true });
    } catch (err) {
      console.warn("[Travel] failed to update URL for trip:", err);
    }
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

  async function toggleFollow() {
    if (!resolvedUid || !user || !user.uid) {
      setToast({ msg: "Sign in to follow", type: "warning" }); setTimeout(() => setToast(null), 1400);
      return;
    }
    if (resolvedUid === user.uid) {
      setToast({ msg: "You cannot follow yourself", type: "warning" }); setTimeout(() => setToast(null), 1400);
      return;
    }
    if (!useFirebase || !db) {
      setIsFollowing((p) => !p);
      return;
    }

    const followDocId = `${user.uid}_${resolvedUid}`;
    const followRef = doc(db, "follows", followDocId);

    setFollowLoading(true);
    try {
      if (isFollowing) {
        // unfollow: delete follow doc (allowed because follower == auth.uid)
        await deleteDoc(followRef);
        setIsFollowing(false);
        setToast({ msg: "Unfollowed", type: "info" });
      } else {
        // follow: create follow doc
        await setDoc(followRef, { followerId: user.uid, followeeId: resolvedUid, createdAt: serverTimestamp() });
        setIsFollowing(true);
        setToast({ msg: "Now following", type: "success" });
      }
    } catch (err) {
      console.error("toggleFollow (follows collection) failed:", err);
      setToast({ msg: "Failed to update follow", type: "warning" });
    } finally {
      setFollowLoading(false);
      setTimeout(() => setToast(null), 1400);
    }
  }

  function getTripStatus(trip, now = Date.now()) {
    if (!trip) return { key: "unknown", label: "Unknown", icon: "❓", color: "gray" };

    const startMs = Date.parse(trip.start_date || trip.startDate || "");
    const endMs = Date.parse(trip.end_date || trip.endDate || "");
    const started = trip.started === true;
    const stopped = trip.stopped === true || trip.stoppedAt || trip.stopped_at;

    if (Number.isFinite(startMs) && startMs > now) {
      return { key: "upcoming", label: "Upcoming", icon: "📅", color: "blue" };
    }

    if (Number.isFinite(endMs) && endMs < now) {
      return { key: "completed", label: "Completed", icon: "✅", color: "green" };
    }

    if (started && !stopped) {
      return { key: "active", label: "Active now", icon: "🚴", color: "red" };
    }

    return { key: "ongoing", label: "Ongoing (paused)", icon: "⏸️", color: "orange" };
  }

  return (
    <div className="travel-container">
      {isOwner && getTripStatus(selectedTrip).key === "ongoing" && (
        <div className="warning-banner">
          ⚠️ Your trip "{selectedTrip.title}" is scheduled for today but hasn’t been started yet. start your trip from your mobile app
        </div>
      )}
      {!isOwner && getTripStatus(selectedTrip).key === "ongoing" && (
        <div className="info-banner">
          🚧 This trip is ongoing ({tripStart} → {tripEnd}), but the rider hasn’t started tracking yet.
          Check back later for live updates!
        </div>
      )}
      <header className="travel-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ minWidth: 0 }}>
            {/* Trip title */}
            <h1 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ whiteSpace: "nowrap", overflow: "visible" }}>
                  {selectedTripId
                    ? (tripTitle || "Trip Title")
                    : (isPublicView
                      ? (profile?.displayName || "Profile")
                      : (tripTitle ? `${tripTitle} — Live` : "Untitled Trip — Live"))}
                </span>

                {isTripActive(selectedTrip) && (
                  <span
                    style={{
                      marginLeft: 6,
                      backgroundColor: "#ef4444", // red
                      color: "white",
                      fontSize: "12px",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    LIVE
                  </span>
                )}


              </span>

              {selectedTrip && (
                <span
                  title={getVisibilityInfo(selectedTrip, user).label}
                  style={{ fontSize: 16, opacity: 0.9 }}
                >
                  {getVisibilityInfo(selectedTrip, user).icon}
                </span>
              )}
            </h1>

            {/* NEW: handler + followers */}
            {isPublicView && (
              <div style={{ fontSize: 13, color: "#aaa", marginBottom: 6 }}>
                @{profile?.handle ?? profile?.displayName?.toLowerCase()?.replace(/\s+/g, "")}
                {" · "}
                {followerCount} followers
              </div>
            )}

            {/* Existing trip info / bio */}
            {selectedTripId ? (
              <>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  {tripStartLocation || tripDestination
                    ? ` ${tripStartLocation || "—"} → ${tripDestination || "—"}`
                    : ""}
                  {(tripStart || tripEnd)
                    ? ` · ${tripStart}${tripEnd ? ` → ${tripEnd}` : ""}`
                    : ""}
                </div>

                {tripNotes && (
                  <div
                    className="muted"
                    style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}
                  >
                    {tripNotes}
                  </div>
                )}
              </>
            ) : (
              isPublicView ? (
                <div className="muted" style={{ fontSize: 13 }}>{profile?.bio}</div>
              ) : (
                <>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {tripStart} {tripEnd ? `→ ${tripEnd}` : ""}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {useFirebase
                      ? (firebaseReady ? "Connected to Firebase" : "Connecting...")
                      : "Local-only mode (no Firebase configured)"}
                  </div>
                </>
              )
            )}
          </div>

          {/* Right side buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isPublicView && (
              <>
                <button onClick={startTracking} className="btn-start">Start tracking</button>
                <button onClick={stopTracking} className="btn-stop">Stop</button>
                <button onClick={() => { /* saveTrip implementation */ }} className="btn-start">Save Trip Details</button>
              </>
            )}

            {isPublicView && resolvedUid && user && resolvedUid !== user.uid && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (followLoading) return;
                  toggleFollow();
                }}
                className={`btn-text-follow ${isFollowing ? "following" : ""}`}
                title={isFollowing ? "Unfollow" : "Follow"}
                aria-pressed={isFollowing}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: isFollowing ? "#e63946" : "var(--link-color, #0077b6)",
                  cursor: followLoading ? "default" : "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  textDecoration: isFollowing ? "none" : "none",
                  opacity: followLoading ? 0.7 : 1,
                }}
              >
                {followLoading ? "..." : (isFollowing ? "Following" : "Follow")}
              </button>

            )}

            {/* Share profile */}
            {isPublicView && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  safeShare({
                    url: window.location.href,
                    title: profile?.displayName || `@${profile?.handle}`,
                    text: `Check out this trip on MyApp`,
                    onToast: (msg, type) => setToast({ msg, type })
                  });
                }}
                aria-label="Share profile"
              >Share</button>
            )}

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

      <div className="layout-grid">
        <aside className="layout-sidebar">
          <TripsList savedTrips={savedTrips} selectedTripId={selectedTripId} loadTrip={loadTrip} user={user} isPublicView={isPublicView} openEditModal={openEditModal} setConfirmDelete={setConfirmDelete} />
        </aside>

        {(!isPublicView || Boolean(selectedTripId)) ? (
          <main>
            <MapPanel selectedTrip={selectedTrip} position={position} setShowEmbedModal={setShowEmbedModal} setGoogleEmbedInput={setGoogleEmbedInput} isPublicView={isPublicView} user={user} setToast={setToast} />

            <div style={{ display: "flex", gap: 20, marginTop: 18, flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 320 }}>
                <LiveVideoPanel selectedTrip={selectedTrip} isOwner={isOwner} applyLocalEdit={applyLocalEdit} user={user} db={db} useFirebase={useFirebase} setToast={setToast} />


              </div>

              <div style={{ width: 320, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Compact live map (moved above Itinerary) */}
                <LiveLocationPanel
                  db={db}
                  selectedTrip={selectedTrip}
                  currentUserId={user?.uid}
                  compact={true}
                  mapHeight="220px"
                  mapZoom={16}
                />

                {/* Itinerary sits below the compact live map */}
                <ItineraryPanel itinerary={itinerary} canEditItinerary={canEditItinerary} setShowItineraryModal={setShowItineraryModal} confirmDeleteItinerary={confirmDeleteItinerary} />
              </div>
              <GalleryPanel
                media={media}
                setMedia={setMedia}
                isPublicView={isPublicView}
              />
            </div>
          </main>

        ) : (
          <div className="section" style={{ minHeight: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", maxWidth: 460 }}>
              <h2 style={{ marginBottom: 10, fontSize: "1.5rem", fontWeight: 600 }}>{isPublicView ? "Select a trip to view" : "No trip selected"}</h2>
              <p className="muted" style={{ marginBottom: 20, fontSize: 15, lineHeight: 1.5, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
                {isPublicView ? "This profile has trips on the left. Pick one to load its map, live stream, gallery and itinerary." : "Pick a trip from the list on the left or create a new trip to begin tracking and broadcasting."}
              </p>

              {!isPublicView && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button className="btn-start" onClick={() => createLocalTrip({ title: "My New Trip" })}>Create new trip</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showItineraryModal && (
        <Modal title={`Add Itinerary — ${selectedTrip?.title || tripTitle || "Untitled Trip"}`} onClose={() => setShowItineraryModal(false)}>
          <AddItineraryForm tripTitle={selectedTrip?.title || tripTitle || "Untitled Trip"} onAdd={(item) => { addItinerary(item); setShowItineraryModal(false); }} onCancel={() => setShowItineraryModal(false)} />
        </Modal>
      )}

      {showEditModal && tripToEdit && (
        <EditTripModal
          trip={tripToEdit}
          open={showEditModal}
          saving={savingEdit}
          onCancel={() => { setShowEditModal(false); setTripToEdit(null); }}
          onSave={handleSaveEdit}
          db={db}                                 // <-- give modal access to Firestore client
          ownerUid={user?.uid || null}            // <-- exclude owner from allowedUsers textarea
          resolveHandleToUid={resolveHandleToUidLocal}
          resolveUidToHandle={resolveUidToHandleLocal}
        />
      )}

      {showEmbedModal && (
        <Modal title={`Add Google Map — ${selectedTrip?.title || "Trip"}`} onClose={() => setShowEmbedModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
            <div style={{ fontSize: 13, color: "#555" }}>Paste the iframe HTML or the embed URL from Google My Maps / Google Maps:</div>
            <input placeholder={`Paste iframe or src URL (e.g. <iframe src="..."> or https://www.google.com/maps/d/.../embed)`} value={googleEmbedInput} onChange={(e) => setGoogleEmbedInput(e.target.value)} style={{ width: "100%", padding: "8px 10px", fontSize: 14 }} />

            {extractEmbedSrc(googleEmbedInput) ? (
              <div style={{ border: "1px solid #eee", borderRadius: 6, overflow: "hidden", height: 200 }}>
                <iframe title="Map preview" src={extractEmbedSrc(googleEmbedInput)} width="100%" height="100%" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>Paste a Google My Maps embed iframe or a Google Maps embed URL to see a preview here.</div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-cancel" onClick={() => setShowEmbedModal(false)}>Cancel</button>
              <button className="btn-start" onClick={async () => { await saveGoogleEmbedForSelectedTrip(); setShowEmbedModal(false); }}>Save map</button>
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

      {confirmItin.open && (
        <Modal title="Delete itinerary item?" onClose={() => setConfirmItin({ open: false, id: null, title: null })}>
          <p>Are you sure you want to delete <strong>{confirmItin.title || "this item"}</strong> from the itinerary? This action cannot be undone.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn-danger" onClick={confirmDeleteItineraryConfirmed}>Delete</button>
            <button className="btn-cancel" onClick={() => setConfirmItin({ open: false, id: null, title: null })}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
