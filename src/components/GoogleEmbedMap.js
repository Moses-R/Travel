// src/components/GoogleEmbedMap.jsx
import React from "react";

/**
 * GoogleEmbedMap
 * - embedHtmlOrUrl: either a full <iframe ...> HTML string or a raw embed src URL
 * - height: numeric (px) or css value (defaults to 340)
 */
export default function GoogleEmbedMap({ embedHtmlOrUrl, height = 340 }) {
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

    // Extract src from iframe HTML if provided; otherwise treat input as the src URL
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
