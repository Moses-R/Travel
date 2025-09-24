// src/components/TripsList.jsx
import React from "react";

/* ---------- utility helpers moved from Travel.jsx ---------- */
function toMillis(t) {
    if (t == null) return NaN;
    if (typeof t === "number") return t;
    if (typeof t?.toDate === "function") {
        try {
            return t.toDate().getTime();
        } catch (e) {
            return NaN;
        }
    }
    if (typeof t?.seconds === "number") {
        return t.seconds * 1000 + (t.nanoseconds ? Math.round(t.nanoseconds / 1e6) : 0);
    }
    if (typeof t === "string") {
        const parsed = Date.parse(t);
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
}

function parseDateToMs(d) {
    if (!d) return NaN;
    const ms = toMillis(d);
    return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Determine if a trip should be considered "active".
 * Rules (same logic as Travel.jsx original):
 * - trip.started === true => active
 * - if startedAt <= now and (no endedAt or endedAt > now) => active
 * - if last_position.ts exists and is older than staleMs => inactive
 * Accepts numbers, ISO strings, Firestore Timestamp-likes.
 */
function isTripActiveInternal(trip, opts = {}) {
    if (!trip) return false;
    const now = typeof opts.now === "number" ? opts.now : Date.now();
    const staleMs = typeof opts.staleMs === "number" ? opts.staleMs : 15 * 60 * 1000;

    // IMPORTANT: if trip has an explicit "started: false" (or "false" string),
    // treat it as NOT active — this ensures trips that are scheduled for today
    // but not started are not shown as "Active now".
    if (trip.started === false) return false;
    if (typeof trip.started === "string" && trip.started.toLowerCase() === "false") return false;

    if (trip.started === true) return true;
    if (typeof trip.started === "string" && trip.started.toLowerCase() === "true") return true;

    const startedAtRaw = trip.startedAt ?? trip.started_at ?? trip.startedAtTimestamp ?? trip.startedAtMillis;
    const startedAtMs = toMillis(startedAtRaw);

    if (Number.isFinite(startedAtMs) && startedAtMs <= now) {
        const endedAtRaw = trip.endedAt ?? trip.ended_at ?? trip.endedAtTimestamp ?? trip.endedAtMillis;
        const endedAtMs = toMillis(endedAtRaw);
        if (Number.isFinite(endedAtMs) && endedAtMs <= now) return false;

        if (trip.ended === true || (typeof trip.ended === "string" && trip.ended.toLowerCase() === "true")) return false;

        const lastPos = trip.last_position ?? trip.lastPosition ?? null;
        if (lastPos && (lastPos.ts || lastPos.timestamp)) {
            const lpTs = lastPos.ts ?? lastPos.timestamp;
            const lpMs = toMillis(lpTs);
            if (Number.isFinite(lpMs)) {
                if (now - lpMs > staleMs) return false;
            }
        }

        return true;
    }

    const lastPos2 = trip.last_position ?? trip.lastPosition ?? null;
    if (lastPos2 && (lastPos2.ts || lastPos2.timestamp)) {
        const lpTs = lastPos2.ts ?? lastPos2.timestamp;
        const lpMs = toMillis(lpTs);
        if (Number.isFinite(lpMs) && now - lpMs <= staleMs) return true;
    }

    return false;
}

function formatDateForUI(d) {
    if (!d) return "—";
    const ms = parseDateToMs(d);
    if (!Number.isFinite(ms)) return String(d);
    const dt = new Date(ms);
    // keep same format used elsewhere (YYYY-MM-DD)
    return dt.toISOString().slice(0, 10);
}

/* ---------- new helper: scheduled check ---------- */
/**
 * Returns true if:
 *  - trip has explicit started === false (or "false")
 *  - AND today's local date falls between start_date (inclusive) and end_date (inclusive)
 *
 * Uses local timezone date comparison (so "today" uses user's local date).
 */
function isTripScheduled(trip, opts = {}) {
    if (!trip) return false;
    const now = typeof opts.now === "number" ? opts.now : Date.now();

    const startRaw = trip.startDate ?? trip.start_date ?? trip.start_at ?? trip.startAt;
    const endRaw = trip.endDate ?? trip.end_date ?? trip.end_at ?? trip.endAt;
    const startMs = parseDateToMs(startRaw);
    const endMs = parseDateToMs(endRaw);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

    const toLocalYMD = (ms) => {
        const d = new Date(ms);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const todayYMD = toLocalYMD(now);
    const startYMD = toLocalYMD(startMs);
    const endYMD = toLocalYMD(endMs);

    return startYMD <= todayYMD && todayYMD <= endYMD;
}

/* ---------- component ---------- */
export default function TripsList({
    savedTrips = [],
    selectedTripId,
    loadTrip = () => { },
    user = null,
    isPublicView = false,
    openEditModal = () => { },
    setConfirmDelete = () => { },
    // optional override: if parent passes an isTripActive func, use that; otherwise use internal
    isTripActive: isTripActiveProp = null,
}) {
    // choose active checker
    const activeCheck = typeof isTripActiveProp === "function" ? isTripActiveProp : isTripActiveInternal;

    return (
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

                        let icon = "🔒";
                        let iconTitle = "Private (owner only)";
                        if (visibility === "public") {
                            icon = "🌐";
                            iconTitle = "Public";
                        } else if (visibility === "restricted") {
                            if (isOwner) {
                                icon = "🔑";
                                iconTitle = "Restricted (you own this)";
                            } else if (Array.isArray(t.allowedUsers) && user && t.allowedUsers.includes(user.uid)) {
                                icon = "🔑";
                                iconTitle = "Restricted (you have access)";
                            } else {
                                icon = "🔑";
                                iconTitle = "Restricted";
                            }
                        } else if (visibility === "private" && !isOwner) {
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


                        // Determine badges
                        const active = activeCheck(t);
                        const scheduled = !active && isTripScheduled(t);

                        // console.log("TripList: trip", t.trip_id, "active:", active, "scheduled:", scheduled);
                        return (
                            <li
                                key={t.trip_id}
                                className={`saved-trip ${selectedTripId === t.trip_id ? "active" : ""} compact`}
                                onClick={() => loadTrip(t)}
                                style={{ cursor: 'pointer', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.title}
                                        </div>

                                        {/* Active badge: shown when trip is active */}
                                        {active && (
                                            <span
                                                title="This trip is active"
                                                className="active-dot"
                                                aria-hidden="false"
                                                style={{
                                                    display: "inline-block",
                                                    width: 10,
                                                    height: 10,
                                                    marginLeft: 6,
                                                    borderRadius: "50%",
                                                    backgroundColor: "#22c55e", // green
                                                    boxShadow: "0 0 6px rgba(34, 197, 94, 0.8)",
                                                }}
                                            />
                                        )}

                                        {/* Scheduled badge: only shown when NOT active */}
                                        {scheduled && (
                                            <span
                                                className="trip-scheduled-badge"
                                                title="Scheduled (not started yet)"
                                                aria-label="Scheduled (not started yet)"
                                            >
                                                Scheduled (not started)
                                            </span>
                                        )}


                                    </div>

                                    <div className="muted" style={{ fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.startLocation || '—'}{t.destination ? ` → ${t.destination}` : ''}
                                    </div>

                                    {/* start date → end date */}
                                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                        {formatDateForUI(t.start_date || t.startDate || t.start_at || t.startAt)} – {formatDateForUI(t.end_date || t.endDate || t.end_at || t.endAt)}
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
    );
}
// at bottom or top of src/components/TripsList.jsx
export { isTripActiveInternal as isTripActive, toMillis, parseDateToMs, formatDateForUI, isTripScheduled };
