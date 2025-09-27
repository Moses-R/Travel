import React, { useEffect } from "react";
import "./css/ImageModal.css";
import LeafletMap from "../components/LeafletMap";

/**
 * Props:
 *  - media: object (the media item you passed in)
 *  - onClose: () => void
 *  - open: boolean
 *
 * Example usage:
 *  <ImageModal open={Boolean(sel)} media={sel} onClose={() => setSel(null)} />
 */
export default function ImageModal({ open = false, media = null, onClose = () => { } }) {
    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose();
        }
        if (open) {
            document.body.style.overflow = "hidden";
            window.addEventListener("keydown", onKey);
        }
        return () => {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open || !media) return null;

    const lat = media?.gps?.lat ?? media?.gps?.latitude ?? media?.lat ?? null;
    const lng = media?.gps?.lng ?? media?.gps?.longitude ?? media?.lng ?? null;

    // Prefer EXIF date (media.date) else uploadedAt
    const rawDate = media?.date || media?.uploadedAt || media?.createdAt || null;
    let formattedDate = "Unknown";
    try {
        const dt = rawDate ? new Date(rawDate) : null;
        if (dt && !Number.isNaN(dt.getTime())) {
            formattedDate = dt.toLocaleString("en-GB", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
    } catch (e) {
        /* ignore */
    }

    const mapUrl =
        lat != null && lng != null
            ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=16/${encodeURIComponent(
                lat
            )}/${encodeURIComponent(lng)}`
            : null;

    return (
        <div className="img-modal-overlay" role="dialog" aria-modal="true" aria-label="Image preview">
            <div className="img-modal">
                <div className="img-left">
                    <div className="img-left-inner">
                        {/* support both image and video types; video will show controls */}
                        {media.type === "video" ? (
                            <video src={media.url} controls className="img-full" />
                        ) : (
                            <img src={media.url} alt={media.name || "image"} className="img-full" />
                        )}
                    </div>
                </div>

                <aside className="img-right" aria-label="Image metadata">
                    <div className="img-right-header">
                        {/* removed title and download as requested */}
                        <div />
                        <div className="img-actions">
                            <button className="btn btn-close" onClick={onClose} aria-label="Close preview">
                                Close
                            </button>
                        </div>
                    </div>

                    <div className="meta-list">
                        <div className="meta-row">
                            <div className="meta-key">Date & Time</div>
                            <div className="meta-val">{formattedDate}</div>
                        </div>

                        {/* removed MIME, Size, Uploaded By, StoragePath, and Title */}
                    </div>

                    <div className="map-wrapper">
                        {lat != null && lng != null ? (
                            <LeafletMap lat={lat} lng={lng} zoom={16} markerLabel={media.name || ""} />
                        ) : (
                            <div className="map-empty">No GPS data available for this image</div>
                        )}
                    </div>

                </aside>
            </div>
        </div>
    );
}
