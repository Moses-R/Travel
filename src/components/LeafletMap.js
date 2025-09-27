// LeafletMap.jsx
import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Robust Leaflet map for modal usage.
 * Props:
 *  - lat: number
 *  - lng: number
 *  - zoom?: number (default 15)
 *  - markerLabel?: string
 *
 * Supports CRA/Webpack and Vite by resolving marker asset URLs.
 */
export default function LeafletMap({ lat, lng, zoom = 15, markerLabel = "" }) {
    const mapRef = useRef(null);
    const containerRef = useRef(null);

    // Fix default icon paths for different bundlers
    useEffect(() => {
        try {
            // If using Vite / ES modules, this pattern works:
            // new URL(...) resolves to the bundled file URL.
            // If that fails (older bundlers), fallback to require() which CRA/webpack supports.
            let iconUrl, iconRetinaUrl, shadowUrl;
            try {
                // Vite / modern ESM environment
                iconUrl = new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href;
                iconRetinaUrl = new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href;
                shadowUrl = new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href;
            } catch (e) {
                // webpack / CRA fallback
                // eslint-disable-next-line global-require, import/no-extraneous-dependencies
                const markerIcon = require("leaflet/dist/images/marker-icon.png");
                // eslint-disable-next-line global-require
                const markerIcon2x = require("leaflet/dist/images/marker-icon-2x.png");
                // eslint-disable-next-line global-require
                const markerShadow = require("leaflet/dist/images/marker-shadow.png");
                iconUrl = markerIcon;
                iconRetinaUrl = markerIcon2x;
                shadowUrl = markerShadow;
            }

            // Apply to default icon
            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl,
                iconUrl,
                shadowUrl,
            });
        } catch (err) {
            // If anything fails, ignore — map will still render but marker may be default
            // console.warn("Leaflet icon fix failed", err);
        }
    }, []);

    useEffect(() => {
        if (lat == null || lng == null) return;

        // Clean up previous map (hot reload / remount safety)
        if (mapRef.current) {
            try {
                mapRef.current.remove();
            } catch (e) { }
            mapRef.current = null;
        }

        const map = L.map(containerRef.current, {
            center: [lat, lng],
            zoom,
            attributionControl: false,
            zoomControl: true,
        });
        mapRef.current = map;

        // Add tile layer
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            crossOrigin: true,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        // Add marker with a slightly larger icon & shadow to improve visibility.
        const marker = L.marker([lat, lng]).addTo(map);
        if (markerLabel) marker.bindPopup(markerLabel);

        // Ensure map properly sizes inside modal: give the browser a tick then invalidate
        setTimeout(() => {
            try {
                map.invalidateSize();
                // keep marker centered and visible
                map.setView([lat, lng], map.getZoom(), { animate: false });
            } catch (e) { }
        }, 120); // 120ms is usually enough; increase if your modal has animations

        return () => {
            try {
                map.remove();
            } catch (e) { }
            mapRef.current = null;
        };
    }, [lat, lng, zoom, markerLabel]);

    // container must have height via CSS (your modal CSS already does .map-wrapper)
    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} aria-hidden={false} />;
}
