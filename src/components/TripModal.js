// src/components/TripModal.jsx
import React, { useState, useEffect, useRef } from "react";
import "./css/TripModal.css";
import { normalizeSlug } from "../utils/slug";

/**
 * Props
 * - open
 * - onClose
 * - onSave(payload) -> legacy fallback (should return saved trip or id)
 * - saving (bool)
 * - currentUserId (string|null)
 * - createTripCallable (optional) - object with:
 *     - checkSlugAvailability(slug) => { available: boolean }
 *     - createTrip({ slug, tripData }) => { id, slug } (atomic server-side)
 */
export default function TripModal({
  open,
  onClose,
  onSave,
  saving = false,
  currentUserId = null,
  createTripCallable = null,
}) {
  const [title, setTitle] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);
  const [localToast, setLocalToast] = useState(null); // { msg, type }

  // slug state
  const [slugInput, setSlugInput] = useState("");
  const [slugNormalized, setSlugNormalized] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(null);
  const debounceRef = useRef(null);

  const titleRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset local form when modal opens/closes
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
      setAvailable(null);
      setChecking(false);
      return;
    }
    // focus title when opened
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Normalize & debounce availability check
  useEffect(() => {
    const base = slugInput?.trim() || title?.trim() || "";
    const n = normalizeSlug(base);
    setSlugNormalized(n);
    setAvailable(null);

    // No normalized slug -> nothing to check
    if (!n) {
      setChecking(false);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }

    // Start debounce check
    setChecking(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      if (createTripCallable && typeof createTripCallable.checkSlugAvailability === "function") {
        try {
          const res = await createTripCallable.checkSlugAvailability(n);
          if (!mountedRef.current) return;
          setAvailable(Boolean(res?.available));
        } catch (err) {
          console.warn("[TripModal] checkSlugAvailability failed", err);
          if (!mountedRef.current) return;
          setAvailable(false);
        } finally {
          if (!mountedRef.current) return;
          setChecking(false);
        }
      } else {
        // No server checker provided — mark unknown (null) but stop "checking"
        setAvailable(null);
        setChecking(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slugInput, title, createTripCallable]);

  // Defensive extractId helper
  const extractId = (s) => {
    if (!s) return null;
    if (typeof s === "string") return s;
    if (s.id) return s.id;
    if (s.trip_id) return s.trip_id;
    if (s.docId) return s.docId;
    if (s.slug && typeof s.slug === "string") return s.slug;
    if (s.ref && s.ref.id) return s.ref.id;
    if (s._delegate && s._delegate.id) return s._delegate.id;
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!title.trim()) {
      setError("Please provide a title for the trip.");
      titleRef.current?.focus();
      return;
    }
    if (!startDate) {
      setError("Please provide a start date for the trip.");
      return;
    }

    // Choose slug: user-provided else generated from title
    const normalized = normalizeSlug(slugInput?.trim() || title?.trim() || "");
    if (!normalized) {
      setError("Could not generate a slug from the title. Try a different title or provide a slug.");
      return;
    }

    // If availability was checked and we know it's unavailable, prevent submission
    if (available === false) {
      setError("That slug is already taken. Please choose a different slug.");
      return;
    }

    setLocalToast(null);

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
    console.info("Submitting payload for trip create:", payload);

    try {
      // Prefer server-side atomic create (with slug reservation)
      if (createTripCallable && typeof createTripCallable.createTrip === "function") {
        const res = await createTripCallable.createTrip({ slug: normalized, tripData: payload });
        const savedId = extractId(res) || res?.id || `trip_local_${Date.now()}`;

        // dispatch minimal event: only id
        window.dispatchEvent(new CustomEvent("trip:created", { detail: { trip_id: savedId } }));

        setLocalToast({ msg: "Trip saved successfully!", type: "success" });
        setTimeout(() => {
          setLocalToast(null);
          // Close modal & redirect if slug returned
          onClose?.();
          if (res?.slug) {
            // navigate to canonical public URL
            window.location.href = `/t/${res.slug}`;
          }
        }, 700);
        return;
      }

      // Fallback: call legacy onSave and assume server returns something useful
      if (typeof onSave === "function") {
        const saved = await onSave({ ...payload, slug: normalized });
        const savedId = extractId(saved) || `trip_local_${Date.now()}`;

        window.dispatchEvent(new CustomEvent("trip:created", { detail: { trip_id: savedId } }));

        setLocalToast({ msg: "Trip saved successfully!", type: "success" });
        setTimeout(() => {
          setLocalToast(null);
          onClose?.();
          // If fallback returned slug, redirect
          const returnedSlug = saved?.slug || (typeof saved === "string" ? saved : null);
          if (returnedSlug) window.location.href = `/t/${returnedSlug}`;
        }, 700);
        return;
      }

      // If neither callable nor onSave provided — error
      throw new Error("No create handler provided (createTripCallable or onSave).");
    } catch (err) {
      console.error("Failed to save trip from TripModal:", err);
      const message = err?.message || (err?.code === "already-exists" ? "Slug already taken" : "Failed to save trip.");
      setError(message);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-modal-title"
      >
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

          {/* Slug */}
          <div style={{ marginBottom: 10 }}>
            <label>Slug (optional)</label>
            <input
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder="custom-slug-or-blank-to-generate-from-title"
              aria-label="Trip slug"
            />
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {checking ? (
                <span>Checking…</span>
              ) : slugNormalized ? (
                available === null ? (
                  <span>Preview: <strong>/{`t/${slugNormalized}`}</strong> (availability unknown)</span>
                ) : available ? (
                  <span style={{ color: "green" }}>/{`t/${slugNormalized}`} is available</span>
                ) : (
                  <span style={{ color: "red" }}>/{`t/${slugNormalized}`} is taken</span>
                )
              ) : (
                <span>Enter a title or slug to preview the URL</span>
              )}
            </div>
          </div>

          {/* Start location + Destination */}
          <div className="field-inline" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Start location</label>
              <input
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                placeholder="City or place (optional)"
                aria-label="Start location"
              />
            </div>

            <div style={{ flex: 1 }}>
              <label>Destination</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination (city/region)"
                aria-label="Destination"
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
              />
            </div>
            <div>
              <label>End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
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

          {error && (
            <div className="error" role="status" style={{ marginTop: 10 }}>
              {error}
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
              disabled={saving}
              className="btn btn-secondary btn-small"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary btn-small"
            >
              {saving ? "Saving..." : "Save Trip"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
