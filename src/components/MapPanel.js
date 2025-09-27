// src/components/MapPanel.jsx
import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * MapPanel
 *
 * Props:
 * - selectedTrip: object | null
 * - position: { lat: number, lng: number, ts?: number } | null
 * - setShowEmbedModal: (bool) => void
 * - setGoogleEmbedInput: (str) => void
 * - isPublicView: boolean
 * - user: object | null
 * - setToast: (obj|null) => void
 *
 * This file also exports:
 * - extractEmbedSrc(input) -> string (either iframe src or raw URL)
 *
 * NOTE: GoogleEmbedMap and extractEmbedSrc were moved here from Travel.jsx so map-related logic is colocated.
 */

/* ---------- helper: extract src from iframe HTML or return raw URL ---------- */
export function extractEmbedSrc(input) {
    if (!input) return "";
    const m = String(input).match(/src=["']([^"']+)["']/);
    if (m && m[1]) return m[1];
    // also allow URL with query params that looks like google maps embed link
    return String(input).trim();
}

/* ---------- GoogleEmbedMap component (moved from Travel.jsx) ---------- */
export function GoogleEmbedMap({ embedHtmlOrUrl, height = 340 }) {
    if (!embedHtmlOrUrl) {
        return (
            <div className="map-box section" style={{ height }}>
                <div
                    className="muted"
                    style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    No Google map embed provided.
                </div>
            </div>
        );
    }

    // Accept either full <iframe ...> HTML or a raw src URL
    const srcMatch = String(embedHtmlOrUrl).match(/src=["']([^"']+)["']/);
    const src = srcMatch ? srcMatch[1] : embedHtmlOrUrl;

    return (
        <div className="map-box section" style={{ height, overflow: "hidden", borderRadius: 8 }}>
            <iframe
                title="Custom Google Map"
                src={src}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
            />
        </div>
    );
}

/* ---------- MapPanel component ---------- */
export default function MapPanel({
    selectedTrip = null,
    position = null,
    setShowEmbedModal = () => { },
    setGoogleEmbedInput = () => { },
    isPublicView = false,
    user = null,
    setToast = () => { },
}) {
    const isOwner = Boolean(
        selectedTrip && user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid)
    );

    // If the trip provides a Google embed, render it (accepts iframe HTML or src URL)
    if (selectedTrip && selectedTrip.googleEmbed) {
        return <GoogleEmbedMap embedHtmlOrUrl={selectedTrip.googleEmbed} height={340} />;
    }

    // Determine whether the current viewer may edit / add an embed
    const canEdit = Boolean(selectedTrip && isOwner);

    // Otherwise show live map or placeholder
    return (
        <div className="map-box section" style={{ height: 340, position: "relative", cursor: canEdit ? "pointer" : "default" }}>
            {position ? (
                <MapContainer center={[position.lat, position.lng]} zoom={11} style={{ height: "100%", borderRadius: 8 }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[position.lat, position.lng]}>
                        <Popup>
                            Current location
                            <br />
                            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                        </Popup>
                    </Marker>
                </MapContainer>
            ) : (
                // overlay: interactive only for owners (canEdit === true)
                <div
                    role={canEdit ? "button" : undefined}
                    tabIndex={canEdit ? 0 : -1}
                    onClick={(e) => {
                        if (!canEdit) {
                            // non-owners do nothing; optionally show a small toast if desired
                            return;
                        }
                        // open modal to paste Google map embed (owner only)
                        setGoogleEmbedInput(selectedTrip?.googleEmbed || "");
                        setShowEmbedModal(true);
                    }}
                    onKeyDown={(e) => {
                        if (!canEdit) return;
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.currentTarget.click();
                        }
                    }}
                    style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                        gap: 10,
                        padding: 16,
                        textAlign: "center",
                        borderRadius: 8,
                        cursor: canEdit ? "pointer" : "default",
                        userSelect: "none",
                    }}
                    title={canEdit ? "Click to add a Google map for this trip" : "No map available"}
                    aria-label={canEdit ? "Add Google map embed for this trip" : "Map not available"}
                >
                    {canEdit ? (
                        <>
                            <div className="muted" style={{ fontSize: 15 }}>
                                No GPS fix yet — click "Start tracking"
                            </div>

                            <div style={{ fontSize: 13, color: "#666", maxWidth: 420 }}>
                                Want to show a custom map instead? Click here to paste a Google Maps / My Maps embed URL or iframe.
                            </div>

                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowEmbedModal(true);
                                        setGoogleEmbedInput(selectedTrip?.googleEmbed || "");
                                    }}
                                    className="btn-start"
                                    aria-label="Open map embed dialog"
                                >
                                    Add / Paste Google map
                                </button>

                                {/* small inline hint for owners */}
                                {selectedTrip && (
                                    <div style={{ alignSelf: "center", fontSize: 13, color: "#666" }}>
                                        Owners can save a map for this trip
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="muted" style={{ fontSize: 15 }}>
                                Map unavailable
                            </div>

                            <div style={{ fontSize: 13, color: "#666", maxWidth: 420 }}>
                                The trip owner has not added a custom map.
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
