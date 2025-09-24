// FILE: src/hooks/useTrips.js
import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
    collection,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    getDoc,
    getDocs,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { normalizeHandle } from "../utils/handle";

/**
 * Hook: useTrips
 * - routeHandle: optional handle string to view a profile
 * - useFirebase: boolean (if false, operates local-only)
 * - setToast: optional setter for user feedback
 */
export default function useTrips({ routeHandle, useFirebase = true, setToast }) {
    const [profileLoading, setProfileLoading] = useState(Boolean(routeHandle));
    const [profile, setProfile] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [resolvedUid, setResolvedUid] = useState(null);

    const [savedTrips, setSavedTrips] = useState([]);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [selectedTripId, setSelectedTripId] = useState(null);

    const [user, setUser] = useState(null);
    const [firebaseReady, setFirebaseReady] = useState(false);

    // track latest unsub for cleanup
    const tripsUnsubRef = useRef(null);

    /* ----- resolve handle -> uid ----- */
    useEffect(() => {
        if (!routeHandle) {
            setProfileLoading(false);
            setNotFound(false);
            setResolvedUid(null);
            return;
        }

        let cancelled = false;
        (async () => {
            setProfileLoading(true);
            setNotFound(false);
            setResolvedUid(null);

            try {
                const normalized = normalizeHandle(routeHandle);
                if (!normalized) {
                    setNotFound(true);
                    return;
                }

                // first try handles collection
                const handleRef = doc(db, "handles", normalized);
                const handleSnap = await getDoc(handleRef);
                if (cancelled) return;

                if (handleSnap && handleSnap.exists && handleSnap.exists()) {
                    const data = handleSnap.data();
                    const uid = data?.uid ?? null;
                    if (!uid) {
                        setNotFound(true);
                        return;
                    }
                    setResolvedUid(uid);
                    return;
                }

                // fallback to users collection query
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
            } catch (err) {
                console.error("[useTrips] handle resolution error:", err);
                setNotFound(true);
                if (setToast) setToast({ msg: "Error loading profile", type: "warning" });
            } finally {
                if (!cancelled) setProfileLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [routeHandle]);

    /* ----- load profile document when resolvedUid changes ----- */
    useEffect(() => {
        if (!resolvedUid) return;
        let cancelled = false;
        (async () => {
            setProfileLoading(true);
            try {
                const uref = doc(db, "users", resolvedUid);
                const snap = await getDoc(uref);
                if (cancelled) return;
                if (snap && snap.exists && snap.exists()) {
                    setProfile(snap.data());
                    setNotFound(false);
                } else {
                    setProfile(null);
                    setNotFound(true);
                }
            } catch (err) {
                console.error("[useTrips] load profile failed:", err);
                setProfile(null);
                setNotFound(true);
            } finally {
                if (!cancelled) setProfileLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [resolvedUid]);

    /* ----- snapshot processing helper ----- */
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

    /* ----- push merged snapshots into savedTrips and auto-select logic ----- */
    const tripsMapRef = useRef(new Map());
    const pushSnapshotToMap = (items) => {
        items.forEach((t) => tripsMapRef.current.set(t.trip_id, t));
        const arr = Array.from(tripsMapRef.current.values()).sort((a, b) => {
            const ta = a.created_at ? Date.parse(a.created_at) : 0;
            const tb = b.created_at ? Date.parse(b.created_at) : 0;
            return tb - ta;
        });
        setSavedTrips(arr);

        // auto-select started trip if nothing selected
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
                }
            }
        } catch (err) {
            console.warn("[useTrips] auto-select started trip failed:", err);
        }
    };

    /* ----- setup trip subscriptions based on viewer/owner logic ----- */
    useEffect(() => {
        if (!useFirebase) return;
        // we need an ownerId to subscribe trips for: resolvedUid OR current user (when viewing your own)
        const setupSubscriptions = (currentUser) => {
            // cleanup previous
            if (tripsUnsubRef.current) {
                try { tripsUnsubRef.current(); } catch (e) { /* ignore */ }
                tripsUnsubRef.current = null;
            }
            tripsMapRef.current.clear();

            const ownerId = resolvedUid || (currentUser && currentUser.uid) || null;
            if (!ownerId) {
                setSavedTrips([]);
                return;
            }

            const unsubscribers = [];

            if (currentUser && currentUser.uid === ownerId) {
                // viewer is the owner — subscribe to all trips for owner
                const qOwner = query(collection(db, "trips"), where("owner_id", "==", ownerId), orderBy("createdAt", "desc"));
                const unsubOwner = onSnapshot(qOwner, (snap) => {
                    const items = processSnapshot(snap);
                    pushSnapshotToMap(items);
                }, (err) => {
                    console.error("[useTrips] owner trips snapshot error:", err);
                    if (setToast) setToast({ msg: "Failed to sync trips", type: "warning" });
                });
                unsubscribers.push(unsubOwner);
            } else {
                // not owner: subscribe to public trips
                const qPublic = query(
                    collection(db, "trips"),
                    where("owner_id", "==", ownerId),
                    where("visibility", "==", "public"),
                    orderBy("createdAt", "desc")
                );
                const unsubPublic = onSnapshot(qPublic, (snap) => {
                    const items = processSnapshot(snap);
                    pushSnapshotToMap(items);
                }, (err) => {
                    console.error("[useTrips] public trips snapshot error:", err);
                });
                unsubscribers.push(unsubPublic);

                // restricted where allowedUsers contains current user (if signed-in)
                if (currentUser && currentUser.uid) {
                    const qAllowed = query(
                        collection(db, "trips"),
                        where("owner_id", "==", ownerId),
                        where("allowedUsers", "array-contains", currentUser.uid),
                        orderBy("createdAt", "desc")
                    );
                    const unsubAllowed = onSnapshot(qAllowed, (snap) => {
                        const items = processSnapshot(snap);
                        pushSnapshotToMap(items);
                    }, (err) => {
                        console.error("[useTrips] allowed trips snapshot error:", err);
                    });
                    unsubscribers.push(unsubAllowed);
                }
            }

            tripsUnsubRef.current = () => {
                try { unsubscribers.forEach((u) => u && u()); } catch (e) { /* ignore */ }
            };
        };

        // whenever resolvedUid or user changes, reset subscriptions
        setupSubscriptions(user);

        return () => {
            if (tripsUnsubRef.current) {
                try { tripsUnsubRef.current(); } catch (e) { /* ignore */ }
                tripsUnsubRef.current = null;
            }
            tripsMapRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedUid, user, useFirebase]);

    /* ----- auth listener ----- */
    useEffect(() => {
        if (!useFirebase) return;
        const unsubAuth = onAuthStateChanged(auth, (u) => {
            setUser(u || null);
            setFirebaseReady(true);
        });
        return () => unsubAuth && unsubAuth();
    }, [useFirebase]);

    /* ----- small helpers for host component ----- */
    const applyLocalEdit = (updated) => {
        if (!updated || !updated.trip_id) return;
        setSavedTrips((prev) => prev.map((t) => (t.trip_id === updated.trip_id ? { ...t, ...updated } : t)));
        if (selectedTripId === updated.trip_id) {
            setSelectedTrip((s) => s ? { ...s, ...updated } : s);
        }
    };

    const createLocalTrip = (overrides) => {
        const local = {
            trip_id: `local_${Date.now()}`,
            title: overrides.title || "New Trip",
            created_at: new Date().toISOString(),
            itinerary: [],
            media: [],
            ownerId: user?.uid || null,
        };
        setSavedTrips((p) => [local, ...p]);
        setSelectedTrip(local);
        setSelectedTripId(local.trip_id);
    };

    const deleteTrip = (id) => {
        setSavedTrips((s) => s.filter((t) => t.trip_id !== id));
        if (selectedTripId === id) {
            setSelectedTripId(null);
            setSelectedTrip(null);
        }
    };

    const openEditModal = (t) => {
        // consumer handles showing modal; this just sets the tripToEdit holder if needed
        // returning stub so Travel.jsx's calls still work
        // (if you want to store tripToEdit in hook, add state for it)
        // for now we just set selectedTrip
        setSelectedTrip(t);
        setSelectedTripId(t?.trip_id || null);
    };

    return {
        profileLoading,
        profile,
        notFound,
        resolvedUid,
        savedTrips,
        selectedTrip,
        selectedTripId,
        setSelectedTrip,
        setSelectedTripId,
        user,
        firebaseReady,
        applyLocalEdit,
        createLocalTrip,
        deleteTrip,
        openEditModal,
        setProfile,
        setNotFound,
        setResolvedUid,
    };
}
