// src/components/ItineraryPanel.jsx
import React, { useState } from "react";

/**
 * ItineraryPanel
 *
 * Props:
 * - itinerary: array of items { id?, day?, route?, place?, distance?, notes? }
 * - canEditItinerary: boolean
 * - setShowItineraryModal: (bool) => void
 * - confirmDeleteItinerary: (id, label) => void
 */
export default function ItineraryPanel({
    itinerary = [],
    canEditItinerary = false,
    setShowItineraryModal = () => { },
    confirmDeleteItinerary = () => { },
}) {
    return (
        <aside style={{ flex: 1, minWidth: 260 }}>
            <div className="section">
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
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
                    {(!Array.isArray(itinerary) || itinerary.length === 0) && (
                        <li className="muted">No itinerary items yet.</li>
                    )}

                    {(Array.isArray(itinerary) ? itinerary : []).map((it, idx) => (
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
                                <div className="place">
                                    Day {it.day || idx + 1}: {it.route || it.place}
                                </div>
                                {it.distance && <div className="date">{it.distance}</div>}
                                {it.notes && <div className="notes">{it.notes}</div>}
                            </div>

                            {canEditItinerary && (
                                <div
                                    style={{
                                        marginLeft: 8,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 6,
                                    }}
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            confirmDeleteItinerary(it.id || null, it.route || `Day ${idx + 1}`);
                                        }}
                                        className="btn-icon"
                                        title="Delete itinerary item"
                                        aria-label="Delete itinerary item"
                                    >
                                        {/* Trash icon */}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
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
    );
}

/* ---------- AddItineraryForm (named export) ---------- */
export function AddItineraryForm({ onAdd, onCancel, tripTitle }) {
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
