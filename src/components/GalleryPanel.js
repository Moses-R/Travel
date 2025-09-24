// src/components/GalleryPanel.jsx
import React from "react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseApp, auth, db, storage, isFirebaseConfigured } from "../firebase";

/**
 * GalleryPanel
 *
 * Props:
 * - media: array of { id, url, type ("image"|"video"), name }
 * - setMedia: setter function from parent (setMedia)
 * - isPublicView: boolean
 *
 * NOTE: This file also exports `uploadAndSaveMedia(items, tripId, user)` which uploads
 * items containing `.file` to Firebase Storage and returns updated items (with .url/storageUrl).
 */

/* ---------- firebase usage flag (local copy) ---------- */
const useFirebase = Boolean(isFirebaseConfigured && firebaseApp && auth && db && storage);

/* ---------- helper to upload a single file to storage ---------- */
async function uploadFileToStorage(userId, tripId, file) {
    if (!useFirebase || !storage) throw new Error("Firebase storage not initialized");
    const key = `${userId}/trips/${tripId}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, key);
    const snapshot = await uploadBytes(ref, file);
    const url = await getDownloadURL(snapshot.ref);
    return url;
}

/**
 * uploadAndSaveMedia
 * - items: array of media items, some may have `.file` (File objects)
 * - tripId: destination trip id
 * - user: current firebase user (required to construct storage path)
 *
 * Returns array of items with uploaded files replaced with storageUrl/url and without `.file`.
 */
export async function uploadAndSaveMedia(items = [], tripId, user) {
    if (!useFirebase || !user) {
        // If firebase not available or no user, return items but strip file references (avoid leaking File)
        return items.map((it) => {
            const clone = { ...it };
            if (clone.file) delete clone.file;
            return clone;
        });
    }

    const uploaded = [];
    for (const it of items) {
        try {
            if (it && it.file) {
                const storageUrl = await uploadFileToStorage(user.uid, tripId, it.file);
                uploaded.push({ ...it, storageUrl, url: storageUrl, file: undefined });
            } else {
                uploaded.push(it);
            }
        } catch (err) {
            console.error("GalleryPanel.uploadAndSaveMedia: upload failed", err);
            // keep original but drop file to avoid holding File objects
            const safe = { ...it };
            if (safe.file) delete safe.file;
            uploaded.push(safe);
        }
    }
    return uploaded;
}

/* ---------- GalleryPanel component ---------- */
export default function GalleryPanel({
    media = [],
    setMedia = () => { },
    isPublicView = false,
}) {
    // handle file selection (input change)
    const handleMediaSelected = (e) => {
        const files = Array.from(e.target.files || []);
        const newItems = files.map((file) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: file.type.startsWith("video") ? "video" : "image",
            url: URL.createObjectURL(file),
            name: file.name,
            date: new Date().toISOString(),
            file,
        }));
        // prepend so newest appear first (keeps behavior similar to previous)
        setMedia((m) => [...newItems, ...(Array.isArray(m) ? m : [])]);
        // clear file input value to allow re-upload of same file later (handled by React input element lifecycle)
        if (e.target) e.target.value = "";
    };

    const removeMedia = (id) => {
        setMedia((m) => (Array.isArray(m) ? m.filter((x) => x.id !== id) : m));
    };

    return (
        <section className="section" style={{ width: "100%", maxWidth: "100%", flex: "1 1 100%" }}>
            <h2>Gallery (Photos & Videos)</h2>

            {!isPublicView && (
                <input type="file" accept="image/*,video/*" multiple onChange={handleMediaSelected} style={{ marginTop: 8 }} />
            )}

            <div className="gallery" style={{ marginTop: 12 }}>
                {(!Array.isArray(media) || media.length === 0) && (
                    <div className="muted" style={{ padding: 12 }}>No media uploaded yet.</div>
                )}

                {(Array.isArray(media) ? media : []).map((m) => (
                    <div key={m.id} className="gallery-item">
                        {m.type === "image" ? (
                            <img src={m.url} alt={m.name} />
                        ) : (
                            <video src={m.url} controls className="media-preview" />
                        )}

                        <div className="info">
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                                {m.name}
                            </div>

                            {!isPublicView && (
                                <button onClick={() => removeMedia(m.id)} className="btn-link-danger">Remove</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
