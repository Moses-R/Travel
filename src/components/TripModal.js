// src/components/TripModal.jsx
import React, { useState, useEffect, useRef } from "react";
import "./css/TripModal.css";
import { normalizeSlug } from "../utils/slug";
// add this at top with the other imports
import { useNavigate } from "react-router-dom";

// Firestore imports (uses your app's exported `db`)
import { db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, getDocs } from "firebase/firestore";

/**
 * Props
 * - open
 * - onClose
 * - onSave(payload) -> legacy fallback (should return saved trip or id)
 * - saving (bool)
 * - currentUserId (string|null)
 * - createTripCallable (optional) - object with:
 *     - checkSlugAvailability(slug) => { available: boolean }
 *     - createTrip({ slug, tripData }) => { id, slug }
 */
export default function TripModal({
  open,
  onClose,
  onSave,
  saving = false,
  currentUserId = null,
  createTripCallable = null,
}) {
  // form
  const [title, setTitle] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const navigate = useNavigate();

  // UI state
  const [error, setError] = useState(null);
  const [localToast, setLocalToast] = useState(null);

  // slug
  const [slugInput, setSlugInput] = useState("");
  const [slugNormalized, setSlugNormalized] = useState("");
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(null);
  const slugDebounceRef = useRef(null);

  // conflict / Firestore trips
  const [ownerTrips, setOwnerTrips] = useState([]); // live list from Firestore for currentUserId
  const [conflictingTrips, setConflictingTrips] = useState([]); // derived conflicts for UI
  const [conflictChecking, setConflictChecking] = useState(false);
  const [checkingTrips, setCheckingTrips] = useState(false); // final-check guard

  // refs
  const titleRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Reset form on open/close
  useEffect(() => {
    if (!open) {
      setTitle("");
      setStartLocation("");
      setDestination("");
      setStartDate("");
      setEndDate("");
      setNotes("");
      setError(null);
      setLocalToast(null);
      setSlugInput("");
      setSlugNormalized("");
      setSlugAvailable(null);
      setOwnerTrips([]);
      setConflictingTrips([]);
      setCheckingTrips(false);
      return;
    }
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* ---------- Firestore real-time subscription (owner trips) ---------- */
  useEffect(() => {
    // we explicitly require Firestore db and a currentUserId to subscribe
    if (!open) return;
    if (!db) {
      // no firestore available; ownerTrips remain empty and creation will be blocked
      setOwnerTrips([]);
      return;
    }
    if (!currentUserId) {
      setOwnerTrips([]);
      return;
    }

    const tripsCol = collection(db, "trips");
    const q = query(tripsCol, where("owner_id", "==", currentUserId), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data() || {};
          return { trip_id: d.id, ...data };
        });
        if (mountedRef.current) setOwnerTrips(arr);
      },
      (err) => {
        console.error("[TripModal] Firestore onSnapshot trips subscription error:", err);
        // keep ownerTrips empty; final submit will error if validation can't run
        if (mountedRef.current) setOwnerTrips([]);
      }
    );

    return () => {
      try { unsub && unsub(); } catch (e) { }
    };
  }, [open, currentUserId]);

  /* ---------- slug availability debounce ---------- */
  useEffect(() => {
    // *** CHANGE: when user leaves slugInput blank, generate slug base from
    // title + startLocation + destination + startDate (in that order).
    // If user types a custom slug, that value is used instead.
    const fieldsBase = [title?.trim(), startLocation?.trim(), destination?.trim(), startDate?.trim()]
      .filter(Boolean)
      .join(" ");
    const base = slugInput?.trim() || fieldsBase || title?.trim() || "";
    const normalized = normalizeSlug(base);
    setSlugNormalized(normalized);
    setSlugAvailable(null);

    if (!normalized) {
      setCheckingSlug(false);
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
      return;
    }

    setCheckingSlug(true);
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    slugDebounceRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      if (createTripCallable && typeof createTripCallable.checkSlugAvailability === "function") {
        try {
          const res = await createTripCallable.checkSlugAvailability(normalized);
          if (!mountedRef.current) return;
          setSlugAvailable(Boolean(res?.available));
        } catch (err) {
          console.warn("[TripModal] checkSlugAvailability failed", err);
          if (!mountedRef.current) return;
          setSlugAvailable(false);
        } finally {
          if (mountedRef.current) setCheckingSlug(false);
        }
      } else {
        setSlugAvailable(null);
        if (mountedRef.current) setCheckingSlug(false);
      }
    }, 350);

    return () => { if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current); };
  }, [slugInput, title, startLocation, destination, startDate, createTripCallable]);

  /* ---------- date parsing that handles YYYY-MM-DD and Firestore Timestamps ---------- */
  function parseDateMs(d) {
    if (!d) return NaN;
    // Firestore Timestamp (client SDK): has toDate()
    if (typeof d?.toDate === "function") {
      try { return d.toDate().getTime(); } catch (e) { return NaN; }
    }
    // Firestore-like server object with seconds/nanoseconds
    if (typeof d?.seconds === "number") {
      const nanos = typeof d.nanoseconds === "number" ? Math.round(d.nanoseconds / 1e6) : 0;
      return d.seconds * 1000 + nanos;
    }
    if (typeof d === "number") return d;
    // YYYY-MM-DD (date input) -> local midnight
    const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = String(d).match(isoDateOnly);
    if (m) {
      const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
      const dt = new Date(y, mo, day);
      return dt.getTime();
    }
    // fallback to Date.parse
    const parsed = Date.parse(d);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function tripRangeMsFromFields(startD, endD) {
    const startMs = parseDateMs(startD);
    if (!Number.isFinite(startMs)) return { startMs: NaN, endMs: NaN };
    if (!endD) {
      const e = new Date(startMs); e.setHours(23, 59, 59, 999);
      return { startMs, endMs: e.getTime() };
    }
    const endRaw = parseDateMs(endD);
    if (!Number.isFinite(endRaw)) {
      const e = new Date(startMs); e.setHours(23, 59, 59, 999);
      return { startMs, endMs: e.getTime() };
    }
    const endOfDay = new Date(endRaw); endOfDay.setHours(23, 59, 59, 999);
    return { startMs, endMs: endOfDay.getTime() };
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
    return aStart <= bEnd && aEnd >= bStart;
  }

  /* ---------- live conflict computation using ownerTrips (realtime) ---------- */
  useEffect(() => {
    // run whenever ownerTrips, startDate or endDate change
    async function computeConflicts() {
      setConflictChecking(true);
      try {
        // If Firestore not configured or ownerTrips empty - no conflicts but we still block at submit
        if (!db || !currentUserId) {
          setConflictingTrips([]);
          setConflictChecking(false);
          return;
        }
        // Only compute when both dates present
        if (!startDate || !endDate) {
          setConflictingTrips([]);
          setConflictChecking(false);
          return;
        }

        const { startMs: newStartMs, endMs: newEndMs } = tripRangeMsFromFields(startDate, endDate);
        if (!Number.isFinite(newStartMs) || !Number.isFinite(newEndMs)) {
          setConflictingTrips([]);
          setConflictChecking(false);
          return;
        }

        const collisions = [];
        for (const t of ownerTrips) {
          // ignore trips without date fields
          const sField = t.startDate ?? t.start_date ?? t.start ?? null;
          const eField = t.endDate ?? t.end_date ?? t.end ?? null;
          const { startMs: sMs, endMs: eMs } = tripRangeMsFromFields(sField, eField);
          if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) continue;
          if (rangesOverlap(newStartMs, newEndMs, sMs, eMs)) {
            collisions.push(t);
          }
        }

        if (mountedRef.current) setConflictingTrips(collisions);
      } catch (err) {
        console.warn("[TripModal] computeConflicts failed:", err);
        if (mountedRef.current) setConflictingTrips([]);
      } finally {
        if (mountedRef.current) setConflictChecking(false);
      }
    }

    computeConflicts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerTrips, startDate, endDate, currentUserId]);

  /* ---------- final submit handler (uses live ownerTrips and blocks if Firestore missing) ---------- */
  const extractId = (s) => {
    if (!s) return null;
    if (typeof s === "string") return s;
    if (s.id) return s.id;
    if (s.trip_id) return s.trip_id;
    if (s.docId) return s.docId;
    if (s.slug && typeof s.slug === "string") return s.slug;
    if (s.ref && s.ref.id) return s.ref.id;
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Required
    if (!title.trim()) { setError("Please provide a title for the trip."); titleRef.current?.focus(); return; }
    if (!startLocation.trim()) { setError("Start location is required."); return; }
    if (!destination.trim()) { setError("Destination is required."); return; }
    if (!startDate) { setError("Start Date is required."); return; }
    if (!endDate) { setError("End Date is required."); return; }

    // Date order check
    const { startMs: newStartMs, endMs: newEndMs } = tripRangeMsFromFields(startDate, endDate);
    if (!Number.isFinite(newStartMs) || !Number.isFinite(newEndMs)) { setError("Invalid start or end date."); return; }
    if (newStartMs > newEndMs) { setError("Start date cannot be after the End date. For a one-day trip, set the same date for both Start and End."); return; }

    // Slug
    // *** CHANGE: generate normalized slug from slugInput OR combined fields (title + startLocation + destination + startDate)
    const fieldsBase = [title?.trim(), startLocation?.trim(), destination?.trim(), startDate?.trim()]
      .filter(Boolean)
      .join(" ");
    const normalized = normalizeSlug(slugInput?.trim() || fieldsBase || title?.trim() || "");
    if (!normalized) { setError("Could not generate a slug from the title. Try a different title or provide a slug."); return; }
    if (slugAvailable === false) { setError("That slug is already taken. Please choose a different slug."); return; }

    // Must have Firestore and live ownerTrips to validate — do not fall back to local storage
    if (!db || !currentUserId) {
      setError("Unable to validate date collisions with existing trips. Firestore is unavailable or user not signed in. Please try again.");
      return;
    }

    setCheckingTrips(true);
    try {
      // final authoritative check using current ownerTrips snapshot
      // if ownerTrips is empty that's fine (means no trips exist). If ownerTrips not loaded yet, attempt a getDocs read to be safe.
      let tripsToCheck = ownerTrips;
      if (!tripsToCheck || tripsToCheck.length === 0) {
        // fall back to immediate fetch (non-realtime) to ensure we have latest
        try {
          const tripsCol = collection(db, "trips");
          const q = query(tripsCol, where("owner_id", "==", currentUserId), orderBy("createdAt", "desc"));
          const snap = await getDocs(q);
          tripsToCheck = snap.docs.map((d) => ({ trip_id: d.id, ...d.data() }));
        } catch (err) {
          console.warn("[TripModal] getDocs fallback failed:", err);
          setError("Unable to validate date collisions with existing trips. Please try again.");
          setCheckingTrips(false);
          return;
        }
      }

      // check overlap
      let collisionDetected = false;
      for (const t of tripsToCheck) {
        const sField = t.startDate ?? t.start_date ?? t.start ?? null;
        const eField = t.endDate ?? t.end_date ?? t.end ?? null;
        const { startMs: sMs, endMs: eMs } = tripRangeMsFromFields(sField, eField);
        if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) continue;
        if (rangesOverlap(newStartMs, newEndMs, sMs, eMs)) {
          collisionDetected = true;
          break;
        }
      }

      if (collisionDetected) {
        setError("date is colliding with your other trip please adjust the date.");
        setCheckingTrips(false);
        return;
      }
    } catch (err) {
      console.error("[TripModal] final collision validation error:", err);
      setError("Unable to validate date collisions with existing trips. Please try again.");
      setCheckingTrips(false);
      return;
    } finally {
      if (mountedRef.current) setCheckingTrips(false);
    }

    // Build payload and create
    const payload = {
      title: title.trim(),
      startLocation: startLocation.trim() || null,
      destination: destination.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      notes: notes.trim() || null,
      visibility: "private",
      slug: normalized,
      ...(currentUserId ? { owner_id: currentUserId, allowedUsers: [currentUserId] } : {}),
      createdAt: new Date().toISOString(),
    };

    try {
      if (createTripCallable && typeof createTripCallable.createTrip === "function") {
        const res = await createTripCallable.createTrip({ slug: normalized, tripData: payload });
        const savedId = extractId(res) || res?.id || `trip_local_${Date.now()}`;

        // dispatch event (keep existing behavior)
        window.dispatchEvent(new CustomEvent("trip:created", { detail: { trip_id: savedId } }));

        setLocalToast({ msg: "Trip saved successfully!", type: "success" });

        // navigate to Travel page and pass the new trip id + payload
        setTimeout(() => {
          setLocalToast(null);
          onClose?.();
          // pass both id and trip payload so Travel.js can select immediately
          navigate("/travel", { state: { tripId: savedId, trip: { ...payload, id: savedId, slug: res?.slug || normalized } } });
        }, 700);

        return;
      }


      if (typeof onSave === "function") {
        const saved = await onSave({ ...payload, slug: normalized });
        const savedId = extractId(saved) || `trip_local_${Date.now()}`;

        window.dispatchEvent(new CustomEvent("trip:created", { detail: { trip_id: savedId } }));
        setLocalToast({ msg: "Trip saved successfully!", type: "success" });

        setTimeout(() => {
          setLocalToast(null);
          onClose?.();

          // Determine slug if returned
          const returnedSlug = saved?.slug || (typeof saved === "string" ? saved : null);

          // Build trip object to pass
          const tripToPass = {
            ...payload,
            id: savedId,
            slug: returnedSlug || normalized,
            // If saved includes other fields (owner_id etc), merge them
            ...(saved && typeof saved === "object" ? saved : {}),
          };

          navigate("/travel", { state: { tripId: savedId, trip: tripToPass } });
        }, 700);

        return;
      }


      throw new Error("No create handler provided (createTripCallable or onSave).");
    } catch (err) {
      console.error("Failed to save trip from TripModal:", err);
      const message = err?.message || "Failed to save trip.";
      setError(message);
    }
  };

  if (!open) return null;

  const disableSave = saving || checkingSlug || conflictChecking || checkingTrips;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="trip-modal-title">
        <h3 id="trip-modal-title">Create trip</h3>

        <form onSubmit={handleSubmit} aria-describedby="trip-modal-desc">
          <div id="trip-modal-desc" className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Add a trip name, where you're starting from, destination, and dates. Fields marked
            <span style={{ marginLeft: 6, fontWeight: 600 }}> *</span> are required.
          </div>

          {/* Title */}
          <div style={{ marginBottom: 10 }}>
            <label>
              Title <span aria-hidden style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g., Leh-Ladakh Ride 2025"
              aria-label="Trip title"
            />
          </div>

          {/* Start location + Destination */}
          <div className="field-inline" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>
                Start location <span aria-hidden style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                placeholder="City or place"
                aria-label="Start location"
                required
              />
            </div>

            <div style={{ flex: 1 }}>
              <label>
                Destination <span aria-hidden style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination (city/region)"
                aria-label="Destination"
                required
              />
            </div>
          </div>

          {/* Dates */}
          <div className="field-inline" style={{ marginTop: 10 }}>
            <div>
              <label>
                Start date <span aria-hidden style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start date"
                required
              />
            </div>
            <div>
              <label>
                End date <span aria-hidden style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginTop: 10 }}>
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Optional notes (packing, riders, reminders...)"
              aria-label="Notes"
            />
          </div>

          {/* Slug (moved below Notes) */}
          <div style={{ marginTop: 10 }}>
            <label>Slug (optional)</label>
            <input
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder="custom-slug-or-blank-to-generate-from-title-location-date"
              aria-label="Trip slug"
            />
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {checkingSlug ? (
                <span>Checking…</span>
              ) : slugNormalized ? (
                slugAvailable === null ? (
                  <span>Preview: <strong>/{`t/${slugNormalized}`}</strong> (availability unknown)</span>
                ) : slugAvailable ? (
                  <span style={{ color: "green" }}>/{`t/${slugNormalized}`} is available</span>
                ) : (
                  <span style={{ color: "red" }}>/{`t/${slugNormalized}`} is taken</span>
                )
              ) : (
                <span>Enter a title or slug to preview the URL</span>
              )}
            </div>
          </div>

          {/* Errors / status */}
          {error && (
            <div className="error" role="status" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}

          {/* Live conflict info */}
          {conflictingTrips && conflictingTrips.length > 0 && (
            <div className="error" role="status" style={{ marginTop: 10 }}>
              date is colliding with your other trip please adjust the date.
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Conflicting trip{conflictingTrips.length > 1 ? "s" : ""}:{" "}
                {conflictingTrips.slice(0, 3).map((t) => t.title || t.slug || "Untitled").join(", ")}
                {conflictingTrips.length > 3 ? ` (+${conflictingTrips.length - 3} more)` : ""}
              </div>
            </div>
          )}

          {localToast && (
            <div className={`toast ${localToast.type}`} style={{ marginTop: 10 }}>
              {localToast.msg}
            </div>
          )}

          <div className="controls" style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={disableSave}
              className="btn btn-secondary btn-small"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={disableSave || (conflictingTrips && conflictingTrips.length > 0)}
              className="btn btn-primary btn-small"
            >
              {disableSave ? "Saving..." : "Save Trip"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
