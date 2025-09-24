// FILE: src/utils/travelHelpers.js
export function toMillis(t) {
    if (t == null) return NaN;
    if (typeof t === 'number') return t;
    if (typeof t?.toDate === 'function') return t.toDate().getTime();
    if (typeof t?.seconds === 'number') return t.seconds * 1000 + (t.nanoseconds ? Math.round(t.nanoseconds / 1e6) : 0);
    if (typeof t === 'string') {
        const parsed = Date.parse(t);
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
}

export function isTripActive(trip, opts = {}) {
    if (!trip) return false;
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const staleMs = typeof opts.staleMs === 'number' ? opts.staleMs : 15 * 60 * 1000;
    if (trip.started === true) return true;
    if (typeof trip.started === 'string' && trip.started.toLowerCase() === 'true') return true;
    const startedAtRaw = trip.startedAt ?? trip.started_at ?? trip.startedAtTimestamp ?? trip.startedAtMillis;
    const startedAtMs = toMillis(startedAtRaw);
    if (Number.isFinite(startedAtMs) && startedAtMs <= now) {
        const endedAtRaw = trip.endedAt ?? trip.ended_at ?? trip.endedAtTimestamp ?? trip.endedAtMillis;
        const endedAtMs = toMillis(endedAtRaw);
        if (Number.isFinite(endedAtMs) && endedAtMs <= now) return false;
        if (trip.ended === true || (typeof trip.ended === 'string' && trip.ended.toLowerCase() === 'true')) return false;
        const lastPos = trip.last_position ?? trip.lastPosition ?? null;
        if (lastPos && (lastPos.ts || lastPos.timestamp)) {
            const lpTs = lastPos.ts ?? lastPos.timestamp;
            const lpMs = toMillis(lpTs);
            if (Number.isFinite(lpMs) && (now - lpMs > staleMs)) return false;
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