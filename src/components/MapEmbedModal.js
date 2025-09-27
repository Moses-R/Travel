// src/components/MapEmbedModal.jsx
import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import "./css/MapEmbedModal.css"; // create or merge below CSS

// reuse your extract helper (copy/paste if not exported from MapPanel)
export function extractEmbedSrc(input) {
    if (!input) return "";
    const m = String(input).match(/src=["']([^"']+)["']/);
    if (m && m[1]) return m[1];
    return String(input).trim();
}

function looksLikeGoogleEmbed(s) {
    if (!s) return false;
    const str = String(s);
    return /google\.com\/maps\/(d\/embed|embed)|maps\.google\.com|google\.com\/maps/i.test(str);
}

/**
 * MapEmbedModal
 *
 * Props:
 * - show: boolean
 * - onClose: () => void
 * - initialValue: string (existing iframe HTML or URL)
 * - onSave: (embedHtmlOrUrl: string) => Promise|void  -> called when user saves
 * - setToast: (obj) => void  (optional) to show success/error messages
 */
export default function MapEmbedModal({ show, onClose, initialValue = "", onSave, setToast }) {
    const [value, setValue] = useState(initialValue || "");
    const [previewSrc, setPreviewSrc] = useState("");
    const [isValid, setIsValid] = useState(false);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        // when modal opens, seed input from initialValue and focus
        if (show) {
            setValue(initialValue || "");
            setTimeout(() => inputRef.current && inputRef.current.focus(), 80);
        }
    }, [show, initialValue]);

    useEffect(() => {
        const src = extractEmbedSrc(value);
        setPreviewSrc(src);
        setIsValid(Boolean(src && looksLikeGoogleEmbed(src)));
    }, [value]);

    const handleSave = async () => {
        if (!isValid) {
            setToast && setToast({ type: "error", message: "Please paste a valid Google Maps / My Maps iframe or URL." });
            return;
        }

        // prefer to store whatever the user pasted (iframe HTML) — if user pasted a raw URL we'll wrap it.
        let finalPayload = value.trim();
        // if value doesn't contain an iframe tag, wrap it with a minimal iframe so your render path can accept it
        if (!/^\s*<iframe/i.test(finalPayload)) {
            // ensure it's a src url (no malicious attributes are added here)
            const src = extractEmbedSrc(finalPayload);
            finalPayload = `<iframe src="${src}" width="100%" height="480" style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
        }

        try {
            setSaving(true);
            // onSave may be async (e.g. write to Firestore). handle both sync/async.
            await Promise.resolve(onSave(finalPayload));
            setToast && setToast({ type: "success", message: "Map saved." });
            onClose && onClose();
        } catch (err) {
            console.error("Failed to save map embed", err);
            setToast && setToast({ type: "error", message: "Failed to save map — try again." });
        } finally {
            setSaving(false);
        }
    };

    if (!show) return null;

    return (
        <div className="memodal-backdrop" role="dialog" aria-modal="true" aria-label="Add Google map embed">
            <div className="memodal" role="document">
                <header className="memodal-header">
                    <h2>Add Google Maps / My Maps embed</h2>
                    <button className="memodal-close" aria-label="Close dialog" onClick={onClose}>
                        ×
                    </button>
                </header>

                <div className="memodal-body">
                    <label className="memodal-label" htmlFor="map-embed-input">
                        Paste the full &lt;iframe&gt; HTML from Google My Maps, or paste a Google Maps embed URL:
                    </label>

                    <textarea
                        id="map-embed-input"
                        ref={inputRef}
                        className="memodal-textarea"
                        placeholder={`e.g. <iframe src="https://www.google.com/maps/d/embed?mid=YOUR_MAP_ID"></iframe> or https://www.google.com/maps/embed?...`}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        rows={6}
                        aria-invalid={!isValid}
                    />

                    <div className="memodal-hint-row">
                        <div className={`memodal-validation ${isValid ? "valid" : "invalid"}`}>
                            {isValid ? "Looks like a Google Maps embed — preview below." : "Paste a Google Maps / My Maps iframe or embed URL to preview."}
                        </div>

                        <div className="memodal-actions-inline">
                            <button
                                className="btn-start"
                                type="button"
                                onClick={() => {
                                    // quick example paste
                                    const sample = `<iframe src="https://www.google.com/maps/d/embed?mid=YOUR_MAP_ID" width="640" height="480"></iframe>`;
                                    setValue(sample);
                                }}
                            >
                                Paste sample
                            </button>

                            <button
                                className="btn-link"
                                type="button"
                                onClick={() => {
                                    setValue("");
                                    inputRef.current && inputRef.current.focus();
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="memodal-preview">
                        <div className="memodal-preview-title">Live preview</div>

                        <div className="memodal-preview-box">
                            {previewSrc && isValid ? (
                                // IMPORTANT: preview iframe uses the extracted src only to reduce possibility of executing stray HTML.
                                <iframe
                                    title="Google map preview"
                                    src={previewSrc}
                                    width="100%"
                                    height="320"
                                    style={{ border: 0 }}
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                    allowFullScreen
                                />
                            ) : (
                                <div className="memodal-preview-empty">Invalid or empty embed. A valid Google Maps / My Maps embed will appear here.</div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="memodal-footer">
                    <div className="memodal-footer-left" />
                    <div className="memodal-footer-right">
                        <button className="btn-link" onClick={onClose} aria-label="Cancel">
                            Cancel
                        </button>
                        <button
                            className="btn-start"
                            onClick={handleSave}
                            disabled={!isValid || saving}
                            aria-disabled={!isValid || saving}
                        >
                            {saving ? "Saving…" : "Save map"}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

MapEmbedModal.propTypes = {
    show: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    initialValue: PropTypes.string,
    setToast: PropTypes.func,
};
