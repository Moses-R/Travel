// src/components/ShareModal.jsx
import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore"; // optional
import "./css/ShareModal.css";

/* Inline SVG icons (small, accessible) */
const IconWhatsApp = ({ className = "" }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M20.52 3.48A11.93 11.93 0 0 0 12.02 0C5.37 0 .07 5.3.07 11.95c0 2.11.55 4.15 1.6 5.95L0 24l6.36-1.67A11.93 11.93 0 0 0 12.02 24c6.65 0 11.95-5.3 11.95-11.95 0-3.2-1.25-6.2-3.45-8.87zM12.02 21.6c-1.6 0-3.14-.42-4.5-1.22l-.32-.19-3.77.99.99-3.68-.2-.34A8.3 8.3 0 0 1 3.7 11.95c0-4.58 3.73-8.3 8.32-8.3 4.57 0 8.3 3.72 8.3 8.3 0 4.57-3.73 8.32-8.3 8.32z" />
        <path fill="currentColor" d="M17.02 14.24c-.3-.15-1.79-.88-2.07-.98-.28-.1-.48-.15-.68.16s-.78.98-.96 1.18c-.17.2-.34.22-.62.07-.28-.15-1.18-.44-2.25-1.39-.83-.74-1.39-1.66-1.55-1.94-.16-.28-.02-.43.13-.58.13-.13.28-.35.42-.52.14-.17.19-.3.28-.5.09-.2.04-.37-.02-.52-.06-.15-.68-1.63-.93-2.24-.24-.59-.49-.51-.68-.52l-.58-.01c-.2 0-.52.07-.79.37-.26.3-1 1-1 2.44 0 1.44 1.03 2.83 1.17 3.03.14.2 2.03 3.1 4.92 4.34 2.9 1.25 2.9.83 3.43.78.53-.05 1.79-.73 2.04-1.44.25-.71.25-1.32.18-1.44-.07-.12-.27-.2-.57-.35z" />
    </svg>
);

const IconFacebook = ({ className = "" }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 4.99 3.66 9.13 8.44 9.92v-7.02H8.08v-2.9h2.22V9.41c0-2.2 1.32-3.41 3.34-3.41.97 0 1.99.17 1.99.17v2.18h-1.11c-1.09 0-1.43.68-1.43 1.37v1.65h2.44l-.39 2.9h-2.05V22c4.78-.79 8.44-4.93 8.44-9.93z" />
    </svg>
);

const IconInstagram = ({ className = "" }) => (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 1 0 12 7.2zM20.4 5.1a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 0 0 2.4 0zM22 12c0 2.61-.05 3.68-.29 4.98a6.36 6.36 0 0 1-1.05 2.33 6.36 6.36 0 0 1-2.33 1.05C16.68 20.95 15.61 21 12.99 21s-3.69-.05-4.98-.29a6.36 6.36 0 0 1-2.33-1.05 6.36 6.36 0 0 1-1.05-2.33C3.05 15.68 3 14.61 3 12s.05-3.69.29-4.98a6.36 6.36 0 0 1 1.05-2.33 6.36 6.36 0 0 1 2.33-1.05C8.31 3.05 9.38 3 12 3s3.69.05 4.98.29a6.36 6.36 0 0 1 2.33 1.05c.78.4 1.42.94 1.86 1.86.4.78.65 1.64.86 2.33.24 1.29.29 2.36.29 4.98z" />
    </svg>
);

const IconLink = ({ className = "" }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M3.9 12a4.1 4.1 0 0 1 4.1-4.1h3a1 1 0 1 1 0 2h-3a2.1 2.1 0 0 0 0 4.2h3a1 1 0 1 1 0 2h-3A4.1 4.1 0 0 1 3.9 12zm9.1-4.1h3a4.1 4.1 0 0 1 0 8.2h-3a1 1 0 1 1 0-2h3a2.1 2.1 0 0 0 0-4.2h-3a1 1 0 1 1 0-2z" />
    </svg>
);

/* Helper to render avatar (avatarUrl optional) */
function Avatar({ avatarUrl, name, size = 36 }) {
    const initials = (name || "")
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

    if (avatarUrl) {
        return <img src={avatarUrl} alt={name} className="share-avatar" width={size} height={size} />;
    }

    return <div className="share-avatar-fallback" aria-hidden="true" style={{ width: size, height: size }}>{initials}</div>;
}

export default function ShareModal({
    open = false,
    onClose = () => { },
    url = typeof window !== "undefined" ? window.location.href : "",
    title = "",         // existing, kept for fallback
    text = "",
    followers = [],
    initialSelected = [],
    onShareWithFollowers = async (ids = []) => { },
    db = null,
    currentUserId = null,
    isProfile = false,   // true when sharing a profile
    handle = "",         // profile handle (without @), e.g. "ride"
    tripName = "",       // trip name (string), used when sharing a trip
}) {
    const [selected, setSelected] = useState(new Set());
    const [copied, setCopied] = useState(false);
    const [busyPlatform, setBusyPlatform] = useState(null);
    const [error, setError] = useState(null);

    // Initialize selected only when modal opens (avoid resetting while open)
    useEffect(() => {
        if (open) {
            setSelected(new Set(initialSelected || []));
        }
        // intentionally only depend on `open` so we don't reset mid-interaction
    }, [open]);

    useEffect(() => {
        if (!open) {
            setCopied(false);
            setBusyPlatform(null);
            setError(null);
        }
    }, [open]);

    if (!open) return null;

    const isLoggedIn = Array.isArray(followers) && followers.length > 0;
    // friendly label in modal indicating what is being shared
    const displayTarget = isProfile
        ? (handle ? `@${handle}` : (title || "profile"))
        : (tripName ? `"${tripName}"` : (title || "this trip"));

    // use checked value from event to avoid double-toggles when label is clicked
    function toggleFromEvent(id, checked) {
        setSelected((prev) => {
            const n = new Set(prev);
            if (checked) n.add(id);
            else n.delete(id);
            return n;
        });
    }

    async function handleCopy() {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement("textarea");
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch (err) {
            console.warn("copy failed", err);
            setError("Failed to copy link");
            setTimeout(() => setError(null), 1800);
        }
    }

    async function handlePlatformShare(platform) {
        setBusyPlatform(platform);
        setError(null);

        const shareData = { title, text: text || title, url };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                setBusyPlatform(null);
                return;
            } catch (err) {
                // fallback to web share url
            }
        }

        const encodedUrl = encodeURIComponent(url || "");
        const encodedText = encodeURIComponent(text || title || "");
        let shareUrl = "";
        if (platform === "whatsapp") {
            shareUrl = `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
        } else if (platform === "facebook") {
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        } else if (platform === "instagram") {
            shareUrl = "https://www.instagram.com/";
        } else {
            shareUrl = url;
        }

        try {
            window.open(shareUrl, "_blank", "noopener,noreferrer");
        } catch (err) {
            console.error("open share url failed", err);
            setError("Failed to open share link");
            setTimeout(() => setError(null), 1600);
        } finally {
            setBusyPlatform(null);
        }
    }

    async function handleShareWithFollowers() {
        setError(null);
        const arr = Array.from(selected);
        if (!arr.length) {
            setError("Select at least one follower");
            setTimeout(() => setError(null), 1600);
            return;
        }

        try {
            await onShareWithFollowers(arr);

            if (db && currentUserId) {
                try {
                    await Promise.all(
                        arr.map(async (fid) => {
                            const nref = doc(collection(db, "notifications"));
                            await setDoc(nref, {
                                to: fid,
                                from: currentUserId,
                                url,
                                title,
                                text,
                                type: "share",
                                createdAt: serverTimestamp(),
                                read: false,
                            });
                        })
                    );
                } catch (err) {
                    console.warn("failed to persist notifications", err);
                }
            }

            setCopied(true);
            setTimeout(() => {
                setCopied(false);
                onClose();
            }, 900);
        } catch (err) {
            console.error("shareWithFollowers failed", err);
            setError(err?.message || "Failed to share");
            setTimeout(() => setError(null), 2000);
        }
    }

    return (
        <div className="share-modal-backdrop" role="dialog" aria-modal="true" aria-label="Share modal">
            <div className="share-modal" role="document">
                <div className="share-modal-header">
                    <h3>Share</h3>
                    <button className="share-modal-close" aria-label="Close" onClick={onClose}>✕</button>
                </div>

                <div className="share-modal-intro">Sharing <strong>{displayTarget}</strong></div>

                <div className="share-modal-actions" role="group" aria-label="Share actions">
                    <button
                        type="button"
                        className="share-modal-btn primary"
                        title="Share to WhatsApp"
                        aria-label="Share to WhatsApp"
                        onClick={() => handlePlatformShare("whatsapp")}
                        disabled={!!busyPlatform}
                    >
                        <IconWhatsApp />
                    </button>

                    <button
                        type="button"
                        className="share-modal-btn primary"
                        title="Share to Instagram"
                        aria-label="Share to Instagram"
                        onClick={() => handlePlatformShare("instagram")}
                        disabled={!!busyPlatform}
                    >
                        <IconInstagram />
                    </button>

                    <button
                        type="button"
                        className="share-modal-btn primary"
                        title="Share to Facebook"
                        aria-label="Share to Facebook"
                        onClick={() => handlePlatformShare("facebook")}
                        disabled={!!busyPlatform}
                    >
                        <IconFacebook />
                    </button>

                    <button
                        type="button"
                        className="share-modal-btn secondary"
                        title="Copy link"
                        aria-label="Copy link"
                        onClick={handleCopy}
                    >
                        <IconLink />
                        <span className="share-muted" style={{ marginLeft: 8 }}>{copied ? "Copied" : "Copy"}</span>
                    </button>
                </div>

                {error && <div className="share-modal-error" role="alert">{error}</div>}

                {isLoggedIn ? (
                    <div className="share-modal-followers" aria-live="polite">
                        <div className="share-modal-followers-header">
                            <div>Share with followers</div>
                            <div className="share-modal-followers-count">{followers.length} followers</div>
                        </div>

                        <div className="share-modal-followers-list" role="list">
                            {followers.map((f) => (
                                <div key={f.id} className="share-modal-follower" role="listitem">
                                    <input
                                        id={`share-f-${f.id}`}
                                        type="checkbox"
                                        checked={selected.has(f.id)}
                                        onChange={(e) => toggleFromEvent(f.id, e.target.checked)}
                                        aria-labelledby={`label-${f.id}`}
                                    />

                                    <label
                                        htmlFor={`share-f-${f.id}`}
                                        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}
                                    >
                                        <Avatar avatarUrl={f.avatarUrl} name={f.displayName || f.handle || "Follower"} />
                                        <div style={{ minWidth: 0 }}>
                                            <div id={`label-${f.id}`} className="name">{f.displayName || "Unnamed"}</div>
                                            <div className="meta">{f.handle ? `@${f.handle}` : (f.email || "")}</div>
                                        </div>
                                    </label>
                                </div>
                            ))}

                            {followers.length === 0 && <div className="share-muted" style={{ padding: 8 }}>No followers yet.</div>}
                        </div>

                        <div className="share-modal-controls">
                            <button className="share-modal-btn secondary share-btn-small" onClick={onClose}>Cancel</button>
                            <button
                                className="share-modal-btn primary share-btn-small"
                                onClick={handleShareWithFollowers}
                                disabled={selected.size === 0}
                                aria-disabled={selected.size === 0}
                            >
                                {selected.size === 0 ? "Select followers" : `Share with ${selected.size}`}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <div className="share-muted" style={{ alignSelf: "center" }}>Sign in to share with your followers</div>
                        <div>
                            <button className="share-modal-btn secondary share-btn-small" onClick={onClose}>Close</button>
                            <button
                                className="share-modal-btn primary share-btn-small"
                                onClick={() => {
                                    if (navigator.share) {
                                        navigator.share({ title, text: text || title, url }).catch(() => { });
                                    } else {
                                        handleCopy();
                                    }
                                }}
                            >
                                {navigator.share ? "Native share" : "Copy link"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

ShareModal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    url: PropTypes.string,
    title: PropTypes.string,
    text: PropTypes.string,
    followers: PropTypes.array,
    initialSelected: PropTypes.array,
    onShareWithFollowers: PropTypes.func,
    db: PropTypes.any,
    currentUserId: PropTypes.string,
};
