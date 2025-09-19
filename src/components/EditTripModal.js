// src/components/EditTripModal.jsx
import React, { useEffect, useState } from "react";
import Modal from "./Modal"; // your existing Modal component
import "./css/EditTripModal.css"; // optional, see notes

export default function EditTripModal({
    open,
    trip = null,
    // accept either onClose or onCancel so parent components can use either prop name
    onClose = undefined,
    onCancel = undefined,
    onSave = async (updatedFields) => { },
    saving = false,
}) {
    const [form, setForm] = useState({
        trip_id: "",
        title: "",
        start_date: "",
        end_date: "",
        startLocation: "",
        destination: "",
        notes: "",
        visibility: "public",
        allowedUsersText: "", // helper for UI (comma/newline separated)
    });

    // custom iframe src state (prefilled from trip if provided)
    const [customMapSrc, setCustomMapSrc] = useState("");

    useEffect(() => {
        if (!trip) {
            setForm({
                trip_id: "",
                title: "",
                start_date: "",
                end_date: "",
                startLocation: "",
                destination: "",
                notes: "",
                visibility: "public",
                allowedUsersText: "",
            });
            setCustomMapSrc("");
            return;
        }

        // Normalize allowedUsers into a editable text field
        const allowedArr = Array.isArray(trip.allowedUsers)
            ? trip.allowedUsers
            : (Array.isArray(trip.allowed_users) ? trip.allowed_users : []);

        const allowedText = allowedArr.join(", ");

        setForm({
            trip_id: trip.trip_id || trip.id || "",
            title: trip.title || "",
            start_date: trip.start_date || trip.startDate || "",
            end_date: trip.end_date || trip.endDate || "",
            startLocation: trip.startLocation || trip.start_location || "",
            destination: trip.destination || trip.dest || "",
            notes: trip.notes || trip.tripNotes || "",
            visibility: trip.visibility || (trip.private ? "private" : "public"),
            allowedUsersText: allowedText,
        });

        // Prefill customMapSrc if the trip object contains a saved iframe src (optional)
        // parent can pass trip.mapIframeSrc or trip.map_iframe_src to prefill
        const pref = trip.mapIframeSrc || trip.map_iframe_src || "";
        setCustomMapSrc(pref);
    }, [trip]);

    if (!open) return null;

    const update = (patch) => setForm((s) => ({ ...s, ...patch }));

    // Use whichever close handler the parent passed
    const handleClose = () => {
        if (typeof onClose === "function") return onClose();
        if (typeof onCancel === "function") return onCancel();
        return undefined;
    };

    const parseAllowedUsers = (text) => {
        if (!text) return [];
        // split on comma or newline, trim, remove leading @ from handles
        const tokens = text
            .split(/[\n,]+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => t.replace(/^@+/, "")); // strip leading @ if user included it
        return tokens;
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        // minimal validation
        if (!form.title?.trim()) {
            return alert("Please provide a title for the trip.");
        }
        const payload = {
            trip_id: form.trip_id,
            title: form.title.trim(),
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            startLocation: form.startLocation || null,
            destination: form.destination || null,
            notes: form.notes || null,
            visibility: form.visibility || "public",
            // Note: we're NOT automatically including customMapSrc in payload.
            // If you want to persist the custom iframe src, parent can read it via a prop callback
            // or we can include it here as: mapIframeSrc: customMapSrc || undefined
        };

        // If restricted, include allowedUsers parsed from the textarea
        if (form.visibility === "restricted") {
            payload.allowedUsers = parseAllowedUsers(form.allowedUsersText);
        } else {
            // ensure we don't accidentally send leftover allowedUsers when not restricted
            payload.allowedUsers = [];
        }

        try {
            await onSave(payload);
        } catch (err) {
            // allow parent to show errors; still keep modal open
            console.error("EditTripModal onSave error:", err);
        }
    };

    // Build a simple embeddable map URL fallback (destination preferred, then start, then "origin to destination")
    const buildAutoMapSrc = () => {
        const origin = (form.startLocation || "").trim();
        const dest = (form.destination || "").trim();
        const qEncode = (s) => encodeURIComponent(s);

        if (dest) {
            return `https://www.google.com/maps?q=${qEncode(dest)}&output=embed`;
        }
        if (origin) {
            return `https://www.google.com/maps?q=${qEncode(origin)}&output=embed`;
        }
        if (origin || dest) {
            // fallback (shouldn't occur because above checks handle them)
            const combined = `${origin} to ${dest}`.trim();
            if (combined) return `https://www.google.com/maps?q=${qEncode(combined)}&output=embed`;
        }
        return null;
    };

    // Helper: if user pasted a full <iframe ... src="..."> tag, try to extract src attribute.
    const extractSrcFromIframe = (input) => {
        if (!input) return "";
        // quick regex to extract src="..."; handles single/double quotes
        const match = input.match(/src=(?:"|')([^"']+)(?:"|')/i);
        if (match && match[1]) return match[1];
        // if the input looks like a raw URL, return as-is
        if (/^https?:\/\//i.test(input.trim())) return input.trim();
        return ""; // not a valid src/url
    };

    // final map src used by iframe: prefer customMapSrc (if valid), else auto-generated one
    const finalMapSrc = (() => {
        const extracted = extractSrcFromIframe(customMapSrc);
        if (extracted) return extracted;
        const auto = buildAutoMapSrc();
        return auto;
    })();

    // Small UX helper: allow clearing the custom iframe input
    const clearCustomMap = () => setCustomMapSrc("");

    return (
        <Modal title="Edit Trip" onClose={handleClose}>
            <form className="edit-trip-form" onSubmit={handleSubmit}>
                <label className="field">
                    <div className="label">Title</div>
                    <input
                        value={form.title}
                        onChange={(e) => update({ title: e.target.value })}
                        required
                        placeholder="Trip title"
                    />
                </label>

                <div style={{ display: "flex", gap: 8 }}>
                    <label className="field" style={{ flex: 1 }}>
                        <div className="label">Start date</div>
                        <input
                            type="date"
                            value={form.start_date || ""}
                            onChange={(e) => update({ start_date: e.target.value })}
                        />
                    </label>

                    <label className="field" style={{ flex: 1 }}>
                        <div className="label">End date</div>
                        <input
                            type="date"
                            value={form.end_date || ""}
                            onChange={(e) => update({ end_date: e.target.value })}
                        />
                    </label>
                </div>

                <label className="field">
                    <div className="label">Start location</div>
                    <input
                        value={form.startLocation || ""}
                        onChange={(e) => update({ startLocation: e.target.value })}
                        placeholder="City, station, etc."
                    />
                </label>

                <label className="field">
                    <div className="label">Destination</div>
                    <input
                        value={form.destination || ""}
                        onChange={(e) => update({ destination: e.target.value })}
                        placeholder="City, station, etc."
                    />
                </label>

                <label className="field">
                    <div className="label">Visibility</div>
                    <select
                        value={form.visibility}
                        onChange={(e) => update({ visibility: e.target.value })}
                    >
                        <option value="public">Public</option>
                        <option value="restricted">Restricted</option>
                        <option value="private">Private</option>
                    </select>
                </label>

                {form.visibility === "restricted" && (
                    <label className="field">
                        <div className="label">Allowed users</div>
                        <small className="muted" style={{ display: "block", marginBottom: 6 }}>
                            Enter user IDs, handles (without the leading "@"), or emails separated by commas or new lines.
                            Example: <code>uid_AbC123, alice@example.com, bob</code>
                        </small>
                        <textarea
                            value={form.allowedUsersText || ""}
                            onChange={(e) => update({ allowedUsersText: e.target.value })}
                            placeholder="user-id-123, alice@example.com, bob_handle"
                            rows={3}
                        />
                    </label>
                )}

                <label className="field">
                    <div className="label">Notes</div>
                    <textarea
                        value={form.notes || ""}
                        onChange={(e) => update({ notes: e.target.value })}
                        placeholder="Notes, stops, highlights..."
                        rows={4}
                    />
                </label>

                {/* Map: always shown by default. Provide an input to override iframe src. */}
                <div className="field" style={{ marginTop: 8 }}>
                    <div className="label">Map preview</div>

                    <small className="muted" style={{ display: "block", marginBottom: 6 }}>
                        The map below updates automatically (destination preferred). If you previously embedded a map
                        with a custom iframe and need to replace it, paste the iframe tag or the iframe <code>src</code> URL here.
                        Example iframe: <code>&lt;iframe src="https://www.google.com/maps?..."&gt;&lt;/iframe&gt;</code>
                    </small>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input
                            type="text"
                            placeholder='Paste iframe tag or src URL to override (optional)'
                            value={customMapSrc}
                            onChange={(e) => setCustomMapSrc(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <button
                            type="button"
                            onClick={clearCustomMap}
                            className="btn-cancel"
                            disabled={!customMapSrc}
                        >
                            Clear
                        </button>
                    </div>

                    <div style={{ border: "1px solid #e1e1e1", borderRadius: 8, overflow: "hidden" }}>
                        {finalMapSrc ? (
                            <iframe
                                title="trip-map"
                                src={finalMapSrc}
                                style={{ width: "100%", height: 300, border: 0 }}
                                loading="lazy"
                            />
                        ) : (
                            <div className="muted" style={{ padding: 12 }}>
                                No map available. Enter a destination or start location above, or paste a valid iframe URL.
                            </div>
                        )}
                    </div>

                    <small className="muted" style={{ display: "block", marginTop: 6 }}>
                        Note: the override accepts either a full <code>&lt;iframe src="..."&gt;</code> tag or a raw URL starting with <code>http</code>.
                    </small>
                </div>

                <div className="modal-actions" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button type="button" className="btn-cancel" onClick={handleClose} disabled={saving}>Cancel</button>
                    <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </div>
            </form>
        </Modal>
    );
}
