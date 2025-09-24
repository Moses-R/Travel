// src/components/LiveVideoPanel.jsx
import React, { useState } from "react";
import Modal from "./Modal"; // adjust import path if Modal is in pages/components
import { doc, updateDoc } from "firebase/firestore";

/**
 * LiveVideoPanel
 *
 * Props:
 * - selectedTrip: object|null
 * - isOwner: boolean
 * - applyLocalEdit: (updateObj) => void   // to update Travel's local state
 * - user: firebase user object | null
 * - db: firebase firestore instance (optional)
 * - useFirebase: boolean
 * - setToast: (toastObj|null) => void
 *
 * This component now contains the YouTube modal and save/clear logic.
 */
export default function LiveVideoPanel({
    selectedTrip,
    isOwner,
    applyLocalEdit = () => { },
    user = null,
    db = null,
    useFirebase = false,
    setToast = () => { },
}) {
    const youtubeId = selectedTrip?.youtubeId || "";
    const [showYoutubeModal, setShowYoutubeModal] = useState(false);
    const [youtubeInput, setYoutubeInput] = useState("");
    const [savingYouTube, setSavingYouTube] = useState(false);
    const [confirmRemoveYoutube, setConfirmRemoveYoutube] = useState(false);

    // extract a YouTube id from many possible inputs (watch URL, embed iframe, youtu.be, /embed, shorts)
    function extractYouTubeId(input) {
        if (!input) return null;
        const s = String(input).trim();
        const srcMatch = s.match(/src=["']([^"']+)["']/);
        const candidate = srcMatch ? srcMatch[1] : s;
        const m =
            candidate.match(/[?&]v=([A-Za-z0-9_\-]{6,})/) ||
            candidate.match(/youtu\.be\/([A-Za-z0-9_\-]{6,})/) ||
            candidate.match(/\/embed\/([A-Za-z0-9_\-]{6,})/) ||
            candidate.match(/youtube\.com\/shorts\/([A-Za-z0-9_\-]{6,})/);
        return m ? m[1] : null;
    }

    // Open modal and prefill from selectedTrip if available
    function openYoutubeModal(prefill = "") {
        if (prefill) setYoutubeInput(prefill);
        else if (youtubeId) setYoutubeInput(`https://www.youtube.com/watch?v=${youtubeId}`);
        else setYoutubeInput("");
        setShowYoutubeModal(true);
    }

    // Save / persist a YouTube id to the selected trip (tries Firestore when available + owner)
    async function saveYouTubeToTrip() {
        const id = extractYouTubeId(youtubeInput || "");
        if (!id) {
            setToast({ msg: "Paste a valid YouTube watch/embed URL or iframe", type: "warning" });
            setTimeout(() => setToast(null), 1800);
            return;
        }

        if (!selectedTrip || !selectedTrip.trip_id) {
            setToast({ msg: "Select a trip first", type: "warning" });
            setTimeout(() => setToast(null), 1600);
            setShowYoutubeModal(false);
            return;
        }

        setSavingYouTube(true);
        try {
            // optimistic local apply
            applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: id });
            setToast({ msg: "YouTube link applied locally", type: "success" });
            setTimeout(() => setToast(null), 1400);

            // persist to Firestore if configured and current user is owner
            const amOwner = user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid);
            if (useFirebase && db && user && amOwner) {
                try {
                    const dr = doc(db, "trips", selectedTrip.trip_id);
                    await updateDoc(dr, { youtubeId: id, updatedAt: new Date().toISOString() });
                    setToast({ msg: "YouTube link saved to trip", type: "success" });
                    setTimeout(() => setToast(null), 1400);
                } catch (err) {
                    console.error("saveYouTubeToTrip firestore error", err);
                    setToast({ msg: "Saved locally (failed to persist)", type: "warning" });
                    setTimeout(() => setToast(null), 1800);
                }
            } else {
                setToast({ msg: "Saved locally (not persisted)", type: "info" });
                setTimeout(() => setToast(null), 1400);
            }
        } finally {
            setSavingYouTube(false);
            setShowYoutubeModal(false);
        }
    }

    // Remove youtubeId from trip (local + Firestore if possible)
    async function clearYouTubeFromTrip() {
        if (!selectedTrip || !selectedTrip.trip_id) return;
        try {
            // optimistic local removal
            applyLocalEdit({ trip_id: selectedTrip.trip_id, youtubeId: "" });
            setToast({ msg: "YouTube link removed locally", type: "info" });
            setTimeout(() => setToast(null), 1200);

            const amOwner = user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid);
            if (useFirebase && db && user && amOwner) {
                try {
                    const dr = doc(db, "trips", selectedTrip.trip_id);
                    await updateDoc(dr, { youtubeId: "", updatedAt: new Date().toISOString() });
                    setToast({ msg: "YouTube link removed", type: "info" });
                    setTimeout(() => setToast(null), 1200);
                } catch (err) {
                    console.error("clearYouTubeFromTrip firestore error", err);
                    setToast({ msg: "Removed locally (failed to persist)", type: "warning" });
                    setTimeout(() => setToast(null), 1400);
                }
            }
        } catch (err) {
            console.error("clearYouTubeFromTrip failed:", err);
            setToast({ msg: "Failed to remove YouTube link", type: "warning" });
            setTimeout(() => setToast(null), 1400);
        } finally {
            setConfirmRemoveYoutube(false);
        }
    }

    return (
        <section className="section">
            <h2>Live Video</h2>

            <div style={{ marginTop: 12 }}>
                {youtubeId ? (
                    <div style={{ height: 340, borderRadius: 8, overflow: "hidden" }}>
                        <iframe
                            title="YouTube Live"
                            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            allowFullScreen
                            loading="lazy"
                        />
                        {isOwner && (
                            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() =>
                                        openYoutubeModal(youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "")
                                    }
                                >
                                    Edit link
                                </button>
                                <button
                                    className="btn-danger"
                                    onClick={() => setConfirmRemoveYoutube(true)}
                                >
                                    Remove link
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        className="map-box section"
                        style={{
                            height: 340,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            padding: 16,
                            cursor: isOwner ? "pointer" : "default",
                            userSelect: "none",
                            borderRadius: 8,
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            if (isOwner) openYoutubeModal();
                        }}
                        onKeyDown={(e) => {
                            if (isOwner && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                openYoutubeModal();
                            }
                        }}
                        aria-label="Attach YouTube live link"
                        title={isOwner ? "Attach YouTube live link" : "No live feed attached"}
                    >
                        <div style={{ maxWidth: 480 }}>
                            <div style={{ fontSize: 16 }} className="muted">
                                No live feed attached
                            </div>
                            <div style={{ marginTop: 8, color: "#666" }}>
                                {isOwner
                                    ? "Attach a YouTube watch URL or iframe to this trip to show a live stream."
                                    : "Owner hasn't attached a live stream yet."}
                            </div>

                            {isOwner && (
                                <div style={{ marginTop: 14 }}>
                                    <button
                                        className="btn-start"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openYoutubeModal();
                                        }}
                                    >
                                        Attach YouTube link
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* YouTube Modal */}
            {showYoutubeModal && (
                <Modal title={`Attach YouTube Live — ${selectedTrip?.title || "Trip"}`} onClose={() => setShowYoutubeModal(false)}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
                        <div style={{ fontSize: 13, color: "#555" }}>
                            Paste the YouTube watch URL (https://www.youtube.com/watch?v=...) or an iframe embed code:
                        </div>
                        <input
                            placeholder={`Paste YouTube watch link or iframe (e.g. <iframe src="https://www.youtube.com/embed/..." />)`}
                            value={youtubeInput}
                            onChange={(e) => setYoutubeInput(e.target.value)}
                            style={{ width: "100%", padding: "8px 10px", fontSize: 14 }}
                        />

                        {/* preview if we can extract an id */}
                        {extractYouTubeId(youtubeInput) ? (
                            <div style={{ border: "1px solid #eee", borderRadius: 6, overflow: "hidden", height: 200 }}>
                                <iframe
                                    title="YouTube preview"
                                    src={`https://www.youtube.com/embed/${extractYouTubeId(youtubeInput)}?autoplay=1`}
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    loading="lazy"
                                    allowFullScreen
                                />
                            </div>
                        ) : (
                            <div className="muted" style={{ fontSize: 13 }}>
                                Paste a YouTube watch URL or iframe to see a preview here.
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="btn-cancel" onClick={() => setShowYoutubeModal(false)}>Cancel</button>
                            <button
                                className="btn-start"
                                onClick={saveYouTubeToTrip}
                                disabled={savingYouTube}
                            >
                                {savingYouTube ? "Saving..." : "Save to trip"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Confirm remove modal */}
            {confirmRemoveYoutube && (
                <Modal title="Remove YouTube link?" onClose={() => setConfirmRemoveYoutube(false)}>
                    <p>Are you sure you want to remove the attached YouTube live link from this trip?</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button
                            className="btn-danger"
                            onClick={() => {
                                clearYouTubeFromTrip();
                            }}
                        >
                            Remove
                        </button>
                        <button className="btn-cancel" onClick={() => setConfirmRemoveYoutube(false)}>Cancel</button>
                    </div>
                </Modal>
            )}
        </section>
    );
}
