// src/components/EditTripModal.jsx
import React, { useEffect, useState } from "react";
import Modal from "./Modal"; // your existing Modal component
import "./css/EditTripModal.css"; // optional, see notes

export default function EditTripModal({
    open,
    trip = null,
    onClose = () => { },
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
    });

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
            });
            return;
        }
        setForm({
            trip_id: trip.trip_id || trip.id || "",
            title: trip.title || "",
            start_date: trip.start_date || trip.startDate || "",
            end_date: trip.end_date || trip.endDate || "",
            startLocation: trip.startLocation || trip.start_location || "",
            destination: trip.destination || trip.dest || "",
            notes: trip.notes || trip.tripNotes || "",
            visibility: trip.visibility || (trip.private ? "private" : "public"),
        });
    }, [trip]);

    if (!open) return null;

    const update = (patch) => setForm((s) => ({ ...s, ...patch }));

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
        };
        try {
            await onSave(payload);
        } catch (err) {
            // allow parent to show errors; still keep modal open
            console.error("EditTripModal onSave error:", err);
        }
    };

    return (
        <Modal title="Edit Trip" onClose={onClose}>

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
                    <select value={form.visibility} onChange={(e) => update({ visibility: e.target.value })}>
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                    </select>
                </label>

                <label className="field">
                    <div className="label">Notes</div>
                    <textarea
                        value={form.notes || ""}
                        onChange={(e) => update({ notes: e.target.value })}
                        placeholder="Notes, stops, highlights..."
                        rows={4}
                    />
                </label>

                <div className="modal-actions" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </div>
            </form>
        </Modal>
    );
}
