// src/components/LiveLocationPanel.jsx
import React, { useEffect, useState } from "react";
import LiveLocationViewer from "./LiveLocationViewer"; // adjust path if needed
import { doc, onSnapshot, getDoc } from "firebase/firestore";

/**
 * LiveLocationPanel
 *
 * Props:
 *  - db: Firestore instance (required)
 *  - selectedTrip: optional trip object (used to derive a doc id)
 *  - docId: explicit liveLocations doc id (optional, overrides selectedTrip)
 *  - currentUserId: id of signed-in user (string) - passed down to LiveLocationViewer
 *  - collectionName: Firestore collection name (defaults to "liveLocations")
 *  - pollOnceFallback: when onSnapshot fails, try a one-time getDoc (default true)
 *  - compact: boolean (default false). If true, render only map iframe + last-updated text.
 *  - mapZoom, mapHeight: forwarded to map iframe when compact
 */
export default function LiveLocationPanel({
    db,
    selectedTrip = null,
    docId = null,
    currentUserId = null,
    collectionName = "liveLocations",
    pollOnceFallback = true,
    compact = false,
    mapZoom = 16,
    mapHeight = "200px",
}) {
    const [loading, setLoading] = useState(true);
    const [liveLocation, setLiveLocation] = useState(null);
    const [error, setError] = useState(null);

    // derive document id: prefer explicit prop, then selectedTrip.liveLocationDocId, then ownerId
    const derivedDocId =
        docId ||
        (selectedTrip && (selectedTrip.liveLocationDocId || selectedTrip.live_location_doc_id)) ||
        (selectedTrip && (selectedTrip.ownerId || selectedTrip.owner_id)) ||
        null;

    useEffect(() => {
        if (!db || !derivedDocId) {
            setLiveLocation(null);
            setLoading(false);
            return;
        }

        let unsub = null;
        setLoading(true);
        setError(null);

        try {
            const ref = doc(db, collectionName, derivedDocId);

            const buildNormalized = (snapOrData, snapRef) => {
                const data = snapOrData || {};
                const allowedRaw = Array.isArray(data.allowedUsers)
                    ? data.allowedUsers
                    : (Array.isArray(data.allowed_users) ? data.allowed_users : []);
                const allowedUsers = Array.isArray(allowedRaw)
                    ? allowedRaw.map((a) => (a == null ? "" : String(a)))
                    : [];

                // normalize updatedAt: prefer updatedAt / updated_at / updated / snap.updateTime
                let updatedVal = data.updatedAt ?? data.updated_at ?? data.updated ?? (snapRef?.updateTime ?? null);

                // If Firestore Timestamp-like, convert to Date
                if (updatedVal && typeof updatedVal.toDate === "function") {
                    try { updatedVal = updatedVal.toDate(); } catch (e) { /* ignore */ }
                }

                // If Date, convert to ISO string
                if (updatedVal instanceof Date) {
                    try { updatedVal = updatedVal.toISOString(); } catch (e) { /* ignore */ }
                }

                return {
                    uid: String(data.uid ?? derivedDocId),
                    displayName: data.displayName ?? data.name ?? data.display_name ?? "",
                    lat: typeof data.lat === "number" ? data.lat : Number(data.latitude ?? data.lat ?? 0),
                    lng: typeof data.lng === "number" ? data.lng : Number(data.longitude ?? data.lng ?? 0),
                    photoURL: data.photoURL ?? data.photoUrl ?? "",
                    accuracy: data.accuracy ?? null,
                    sharing: data.sharing ?? !!data.shared ?? false,
                    updatedAt: updatedVal ?? null,
                    visibility: data.visibility ?? (data.restricted ? "restricted" : "public"),
                    allowedUsers,
                    __raw: data,
                };
            };

            unsub = onSnapshot(
                ref,
                (snap) => {
                    if (!snap.exists()) {
                        setLiveLocation(null);
                        setLoading(false);
                        return;
                    }
                    const normalized = buildNormalized(snap.data(), snap);
                    setLiveLocation(normalized);
                    setLoading(false);
                },
                (err) => {
                    console.error("[LiveLocationPanel] onSnapshot error:", err);
                    setError(err);
                    setLoading(false);

                    if (pollOnceFallback) {
                        getDoc(ref)
                            .then((snap) => {
                                if (snap && snap.exists()) {
                                    const normalized = buildNormalized(snap.data(), snap);
                                    setLiveLocation(normalized);
                                }
                            })
                            .catch((e) => console.warn("[LiveLocationPanel] fallback getDoc failed:", e));
                    }
                }
            );
        } catch (err) {
            console.error("[LiveLocationPanel] subscribe failed:", err);
            setError(err);
            setLoading(false);
        }

        return () => {
            if (unsub) {
                try { unsub(); } catch (e) { /* ignore */ }
            }
        };
        // include currentUserId in deps for reactive owner-derived doc id scenarios
    }, [db, derivedDocId, collectionName, pollOnceFallback, currentUserId]);

    // helper: format updatedAt (ISO string or other)
    const formatUpdated = (u) => {
        if (!u) return "—";
        if (typeof u === "string") {
            const d = new Date(u);
            if (!isNaN(d.getTime())) return d.toLocaleString();
            return u;
        }
        if (u instanceof Date) return u.toLocaleString();
        if (u && typeof u.seconds === "number") {
            return new Date(u.seconds * 1000).toLocaleString();
        }
        return String(u);
    };

    // When compact, render only the map iframe + last-updated (if user is allowed)
    if (compact) {
        // show a small loading / error / empty states
        if (!derivedDocId) return null;
        if (loading) {
            return <div style={{ padding: 8, fontSize: 13, color: "#666" }}>Loading live location…</div>;
        }
        if (error) {
            return <div style={{ padding: 8, color: "crimson", fontSize: 13 }}>Failed to load live location.</div>;
        }
        if (!liveLocation) {
            return <div style={{ padding: 8, fontSize: 13, color: "#666" }}>No live location shared.</div>;
        }

        // permission check: owner or allowedUsers (mirror logic from viewer)
        const curId = currentUserId ? String(currentUserId) : "";
        const isOwner = curId && String(liveLocation.uid) === curId;
        const isAllowed = curId && Array.isArray(liveLocation.allowedUsers) && liveLocation.allowedUsers.includes(curId);
        const canView = liveLocation.visibility === "public" || isOwner || isAllowed;

        if (!canView) {
            return <div style={{ padding: 8, fontSize: 13, color: "#b00" }}>Live location is restricted.</div>;
        }

        const lat = liveLocation.lat ?? 0;
        const lng = liveLocation.lng ?? 0;
        const src = `https://www.google.com/maps?q=${encodeURIComponent(lat + "," + lng)}&z=${mapZoom}&output=embed`;

        return (
            <div style={{ marginTop: 12, borderRadius: 8, overflow: "hidden", background: "#fff", border: "1px solid #eee" }}>
                <div style={{ width: "100%", height: mapHeight }}>
                    <iframe title={`live-location-${liveLocation.uid}`} src={src} style={{ width: "100%", height: "100%", border: 0 }} loading="lazy" />
                </div>
                <div style={{ padding: 8, fontSize: 13, color: "#444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>Last updated</div>
                    <div style={{ fontWeight: 600 }}>{formatUpdated(liveLocation.updatedAt)}</div>
                </div>
            </div>
        );
    }

    // Non-compact: delegate to LiveLocationViewer (full UI)
    return (
        <LiveLocationViewer
            liveLocation={liveLocation}
            allowedUsers={liveLocation?.allowedUsers || []}
            currentUserId={currentUserId}
            mapHeight="h-60"
        />
    );
}
