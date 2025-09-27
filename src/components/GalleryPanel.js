// src/components/GalleryPanel.jsx
import React, { useCallback, useRef, useState, useEffect } from "react";
import heic2any from "heic2any";
import exifr from "exifr";
import {
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    uploadBytesResumable,
    deleteObject,
} from "firebase/storage";
import { firebaseApp, auth, db, storage, isFirebaseConfigured } from "../firebase";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc as docRef, getDocs } from "firebase/firestore";
import { uploadFileAndSaveMeta } from "../utils/storageUploads";
import ImageModal from "../components/ImageModal";

import "./css/GalleryPanel.css";

const useFirebase = Boolean(isFirebaseConfigured && firebaseApp && auth && db && storage);

function uniqueId(prefix = "id") {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch (e) { }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dedupeMediaArray(arr = []) {
    const seen = new Set();
    const out = [];
    for (const it of arr) {
        const key = it?.id ? `id:${it.id}` : (it?.url ? `url:${it.url}` : uniqueId("tmp"));
        if (!seen.has(key)) {
            seen.add(key);
            out.push(it);
        }
    }
    return out;
}

async function isHeicFile(file) {
    const lower = (file.name || "").toLowerCase();
    return (file.type && (file.type.includes("heif") || file.type.includes("heic"))) || lower.endsWith(".heic") || lower.endsWith(".heif");
}
/**
 * Convert HEIC -> JPEG Blob for preview/upload and also return metadata extracted by exifr
 * Returns { blob, metadata, mime }
 */
async function convertHeicForPreview(file) {
    try {
        // read ArrayBuffer for exifr and for conversion
        const ab = await file.arrayBuffer();

        // read metadata (exifr supports HEIC container metadata)
        let metadata = {};
        try {
            metadata = await exifr.parse(ab, { tiff: true, ifd0: true, exif: true, gps: true });
        } catch (metaErr) {
            console.warn("exifr parse failed:", metaErr);
        }

        // convert to jpeg blob (heic2any returns a Blob)
        const convertedBlob = await heic2any({
            blob: new Blob([ab]),
            toType: "image/jpeg",
            quality: 0.92, // adjust if you want smaller files
        });

        return { blob: convertedBlob, metadata, mime: "image/jpeg" };
    } catch (err) {
        console.error("HEIC conversion error", err);
        throw err;
    }
}
/**
 * Resolve a persisted item's latest Storage download URL when possible.
 * If storagePath exists we attempt getDownloadURL, otherwise return item as-is.
 */
async function resolveLatestStorageUrl(item) {
    if (!item || !storage) return item;
    if (item.storagePath) {
        try {
            const sref = storageRef(storage, item.storagePath);
            const url = await getDownloadURL(sref);
            return { ...item, url };
        } catch (err) {
            // transient failures likely; return item unchanged (may be retried by caller)
            console.warn("resolveLatestStorageUrl failed for", item.storagePath, err?.message || err);
            return item;
        }
    }
    return item;
}

export default function GalleryPanel({
    media = [],
    setMedia = () => { },
    isPublicView = false,
    selectedTrip = null,
    user = null,
    setToast = () => { },
}) {
    const fileInputRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progressMap, setProgressMap] = useState({});
    const [modalMedia, setModalMedia] = useState(null);

    const isOwner = Boolean(
        user &&
        selectedTrip &&
        (String(user.uid) === String(selectedTrip.ownerId || selectedTrip.owner_id || selectedTrip.ownerUid || selectedTrip.owner || ""))
    );

    // Clear local-only previews when switching trips — ensures we only show storage-backed images.
    useEffect(() => {
        setMedia((prev) => (Array.isArray(prev) ? prev.filter((m) => !m.file) : []));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTrip?.trip_id]);

    useEffect(() => {
        if (!selectedTrip || !selectedTrip.trip_id || !db) {
            // keep any previews only, remove persisted items
            setMedia((prev) => (Array.isArray(prev) ? prev.filter((m) => m.file) : []));
            return;
        }

        let mounted = true;
        const tripId = selectedTrip.trip_id;
        const mediaCol = collection(db, "trips", tripId, "media");

        // build query defensively
        let q;
        try {
            q = query(mediaCol, orderBy("uploadedAt", "desc"));
        } catch (err) {
            q = query(mediaCol);
        }

        const unsub = onSnapshot(
            q,
            async (snap) => {
                try {
                    // if snapshot empty, try fallback getDocs once
                    let docsToProcess = snap.docs;
                    if (snap.empty) {
                        try {
                            const one = await getDocs(collection(db, "trips", tripId, "media"));
                            if (!one.empty) {
                                docsToProcess = one.docs;
                            }
                        } catch (e) {
                            // ignore fallback error
                        }
                    }

                    // Build persisted list and always fetch latest storage URLs for each persisted item
                    const persisted = await Promise.all(
                        docsToProcess.map(async (d) => {
                            const data = d.data() || {};
                            const uploadedAt =
                                data.uploadedAt && typeof data.uploadedAt.toDate === "function"
                                    ? data.uploadedAt.toDate().toISOString()
                                    : data.uploadedAt || null;

                            const base = {
                                id: d.id,
                                name: data.name || data.title || "file",
                                url: data.url || data.storageUrl || "",
                                type: data.type || (data.mime && data.mime.startsWith("video") ? "video" : "image"),
                                date: data.date || uploadedAt || null,
                                gps: data.gps || null,
                                storagePath: data.storagePath || data.path || null,
                                uploadedBy: data.uploadedBy || data.uploader || null,
                                uploadedAt,
                                _persisted: true,
                            };

                            // ALWAYS attempt to resolve the latest storage URL for persisted items
                            return await resolveLatestStorageUrl(base);
                        })
                    );

                    if (!mounted) return;

                    // Merge persisted items with any local previews
                    setMedia((prev) => {
                        const previews = Array.isArray(prev) ? prev.filter((m) => m.file) : [];
                        return dedupeMediaArray([...persisted, ...previews]);
                    });

                    // If some persisted items are missing `url` but have storagePath, retry resolution a couple of times
                    const itemsToRetry = persisted.filter(it => it && it.storagePath && !it.url);
                    if (itemsToRetry.length > 0) {
                        // attempt re-resolve with backoff, capped attempts
                        const retryResolveMissingUrls = async (items, attempt = 1) => {
                            if (!mounted) return;
                            const delayMs = attempt === 1 ? 1000 : (attempt === 2 ? 3000 : 7000);
                            await new Promise(r => setTimeout(r, delayMs));
                            if (!mounted) return;

                            const reResolved = await Promise.all(items.map(async (it) => {
                                try {
                                    return await resolveLatestStorageUrl(it);
                                } catch (err) {
                                    return it;
                                }
                            }));

                            // If any items got a url now, merge them into media state
                            setMedia((prev) => {
                                const arr = Array.isArray(prev) ? [...prev] : [];
                                for (const rr of reResolved) {
                                    if (rr && rr.url) {
                                        const idx = arr.findIndex(x => x.id === rr.id || x.storagePath === rr.storagePath);
                                        if (idx >= 0) {
                                            arr[idx] = { ...arr[idx], ...rr };
                                        } else {
                                            arr.unshift(rr);
                                        }
                                    }
                                }
                                return dedupeMediaArray(arr);
                            });

                            // Schedule another retry for any still-missing items (but cap attempts to 3)
                            const stillMissing = reResolved.filter(x => x && x.storagePath && !x.url);
                            if (stillMissing.length > 0 && attempt < 3) {
                                retryResolveMissingUrls(stillMissing, attempt + 1);
                            }
                        };

                        // start first retry pass (non-blocking)
                        retryResolveMissingUrls(itemsToRetry, 1);
                    }
                } catch (procErr) {
                    console.error("Error processing media snapshot:", procErr);
                }
            },
            (err) => {
                console.error("media onSnapshot failed", err);
                try {
                    setToast({ msg: "Live media sync error", type: "warning" });
                    setTimeout(() => setToast(null), 2000);
                } catch (e) { }
            }
        );

        return () => {
            mounted = false;
            unsub && unsub();
        };
    }, [selectedTrip?.trip_id, db, setMedia, setToast]);

    const pushFilesToPreview = useCallback(
        async (files) => {
            const fileList = Array.from(files || []);
            if (fileList.length === 0) return;

            const created = await Promise.all(fileList.map(async (file) => {
                try {
                    if (await isHeicFile(file)) {
                        const { blob, metadata, mime } = await convertHeicForPreview(file);
                        const url = URL.createObjectURL(blob);
                        return {
                            id: uniqueId("preview"),
                            type: "image",
                            url,
                            name: file.name.replace(/\.(heic|heif)$/i, ".jpg"),
                            date: metadata?.DateTimeOriginal || new Date().toISOString(),
                            file: new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: mime }),
                            uploaded: false,
                            uploadError: false,
                            gps: metadata?.latitude && metadata?.longitude ? { lat: metadata.latitude, lng: metadata.longitude } : null,
                        };
                    } else {
                        // non-HEIC: as before
                        return {
                            id: uniqueId("preview"),
                            type: file.type && file.type.startsWith("video") ? "video" : "image",
                            url: URL.createObjectURL(file),
                            name: file.name,
                            date: new Date().toISOString(),
                            file,
                            uploaded: false,
                            uploadError: false,
                            gps: null,
                        };
                    }
                } catch (e) {
                    // fallback to basic preview if convert fails
                    return {
                        id: uniqueId("preview"),
                        type: file.type && file.type.startsWith("video") ? "video" : "image",
                        url: URL.createObjectURL(file),
                        name: file.name,
                        date: new Date().toISOString(),
                        file,
                        uploaded: false,
                        uploadError: false,
                        gps: null,
                    };
                }
            }));

            setMedia((m) => {
                const prevArr = Array.isArray(m) ? m : [];
                return dedupeMediaArray([...created, ...prevArr]);
            });
        },
        [setMedia]
    );

    const handleMediaSelected = (e) => {
        const files = Array.from(e.target.files || []);
        pushFilesToPreview(files);
        if (e.target) e.target.value = "";
    };

    const onDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const dt = e.dataTransfer;
        if (!dt) return;
        const files = Array.from(dt.files || []);
        pushFilesToPreview(files);
    };
    const onDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };
    const onDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };
    const onDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    async function uploadSelected() {
        if (!isOwner) return;
        const tripId = selectedTrip?.trip_id;
        if (!tripId) return;

        const toUpload = media.filter((m) => m.file && !m.uploaded && !m.uploadError);
        if (!toUpload.length) return;

        setUploading(true);

        for (const item of toUpload) {
            const id = item.id;
            setProgressMap((p) => ({ ...p, [id]: 0 }));
            setMedia((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === id ? { ...x, uploading: true } : x)) : prev));

            try {
                const final = await uploadFileAndSaveMeta(item.file, tripId, user, (pct) => {
                    setProgressMap((p) => ({ ...p, [id]: pct }));
                });

                if (final && final._firestorePersisted === false) {
                    setToast({ msg: `Upload saved to storage but failed to persist metadata: ${final._firestoreError || "unknown"}`, type: "warning" });
                    setTimeout(() => setToast(null), 3000);
                    setMedia((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === id ? { ...x, uploading: false, uploadError: true, _debug: final } : x)) : prev));
                    continue;
                }

                // final should include storagePath and/or url; but we re-resolve from storage to ensure latest
                const persistedItem = {
                    id: final.id || uniqueId("persisted"),
                    name: final.name || item.name,
                    url: final.url || final.storageUrl || "",
                    type: final.type || item.type || "image",
                    date: final.date || new Date().toISOString(),
                    gps: final.gps || item.gps || null,
                    storagePath: final.storagePath || final.path || final.storagePath,
                    uploadedBy: final.uploadedBy || user?.uid || null,
                    uploadedAt: final.uploadedAt || new Date().toISOString(),
                    _persisted: true,
                };

                // Resolve latest storage url and replace preview
                const resolved = await resolveLatestStorageUrl(persistedItem);

                setMedia((prev) => {
                    const arr = Array.isArray(prev) ? [...prev] : [];
                    const idxById = arr.findIndex((x) => x.id === id);

                    if (idxById >= 0) {
                        arr[idxById] = { ...arr[idxById], ...resolved, uploading: false, uploaded: true, file: undefined };
                        try {
                            if (arr[idxById].url && arr[idxById].url.startsWith("blob:")) URL.revokeObjectURL(arr[idxById].url);
                        } catch (e) { }
                    } else {
                        const idxByUrl = arr.findIndex((x) => x.url === resolved.url || x.url === resolved.storageUrl || (x.url && x.url === item.url));
                        if (idxByUrl >= 0) {
                            arr[idxByUrl] = { ...arr[idxByUrl], ...resolved, uploading: false, uploaded: true, file: undefined };
                            try {
                                if (arr[idxByUrl].url && arr[idxByUrl].url.startsWith("blob:")) URL.revokeObjectURL(arr[idxByUrl].url);
                            } catch (e) { }
                        } else {
                            arr.unshift({ ...resolved, uploading: false, uploaded: true });
                        }
                    }

                    return dedupeMediaArray(arr);
                });
            } catch (err) {
                console.error("Upload failed:", err);
                setMedia((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === id ? { ...x, uploading: false, uploadError: true } : x)) : prev));
                setToast({ msg: "Upload failed", type: "warning" });
                setTimeout(() => setToast(null), 2000);
            } finally {
                setProgressMap((p) => {
                    const c = { ...p };
                    delete c[id];
                    return c;
                });
            }
        }

        setUploading(false);
    }

    const pendingCount = (Array.isArray(media) ? media.filter((m) => m.file && !m.uploaded && !m.uploadError) : []).length;

    // Remove media (persisted or preview). Only owner can remove persisted items.
    const removeMedia = async (mediaIdOrObj) => {
        const item =
            typeof mediaIdOrObj === "string"
                ? media.find((m) => m.id === mediaIdOrObj) || { id: mediaIdOrObj }
                : mediaIdOrObj;

        if (!item) return;
        const tripId = selectedTrip?.trip_id;
        if (!tripId) {
            console.warn("No trip selected");
            return;
        }

        const isOwnerLocal =
            user &&
            (selectedTrip?.ownerId === user.uid ||
                selectedTrip?.owner_id === user.uid ||
                selectedTrip?.owner === user.uid);
        if (!isOwnerLocal) {
            try {
                setToast?.({ msg: "You don't have permission to remove this media", type: "warning" });
                setTimeout(() => setToast?.(null), 1600);
            } catch (e) { }
            return;
        }

        try {
            if (item.id && item._persisted) {
                const docRefToDelete = docRef(db, "trips", tripId, "media", item.id);
                await deleteDoc(docRefToDelete);
            }

            if (item.storagePath) {
                try {
                    const sref = storageRef(storage, item.storagePath);
                    await deleteObject(sref);
                } catch (sErr) {
                    console.warn("deleteObject failed", sErr);
                }
            }

            // revoke blob URLs if preview
            if (item && item.file && item.url && item.url.startsWith && item.url.startsWith("blob:")) {
                try { URL.revokeObjectURL(item.url); } catch (e) { /* ignore */ }
            }

            setMedia((prev) => (Array.isArray(prev) ? prev.filter((x) => x.id !== item.id && x.url !== item.url) : prev));
            try {
                setToast?.({ msg: "Media removed", type: "success" });
                setTimeout(() => setToast?.(null), 1400);
            } catch (e) { }
        } catch (err) {
            console.error("removeMedia failed", err);
            try {
                setToast?.({ msg: "Failed to remove media", type: "warning" });
                setTimeout(() => setToast?.(null), 1600);
            } catch (e) { }
        }
    };

    // cleanup blob URLs for previews when component unmounts
    useEffect(() => {
        return () => {
            try {
                (Array.isArray(media) ? media : []).forEach((m) => {
                    if (m && m.url && m.url.startsWith && m.url.startsWith("blob:")) {
                        try {
                            URL.revokeObjectURL(m.url);
                        } catch (e) { }
                    }
                });
            } catch (e) { }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <section className="gallery-section">
            <h2 className="gallery-title">Gallery (Photos & Videos)</h2>

            {isOwner ? (
                <>
                    <div
                        className={`dropzone ${dragActive ? "drag-active" : ""} ${uploading ? "uploading" : ""}`}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragEnter={onDragEnter}
                        onDragLeave={onDragLeave}
                        onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        aria-label="Drop files here to add previews"
                        role="button"
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            onChange={handleMediaSelected}
                            className="file-input-hidden"
                            disabled={uploading}
                        />
                        <div className="dropzone-text">
                            {uploading ? "Uploading…" : dragActive ? "Drop files to add previews" : "Drag & drop photos or videos here to add previews — or click to choose files"}
                        </div>
                        <div className="dropzone-muted">
                            Files are added as previews; click <strong>Upload Selected</strong> to persist to Firebase Storage & Firestore.
                        </div>
                    </div>

                    {pendingCount > 0 && (
                        <div className="controls">
                            <button className="btn-start" onClick={uploadSelected} disabled={uploading} title={`Upload ${pendingCount} file(s)`}>
                                {uploading ? "Uploading…" : `Upload Selected (${pendingCount})`}
                            </button>

                            <button
                                className="btn-cancel"
                                onClick={() => {
                                    setMedia((m) => {
                                        const prevArr = Array.isArray(m) ? m : [];
                                        prevArr.forEach((it) => {
                                            if (it && it.file && it.url && it.url.startsWith && it.url.startsWith("blob:")) {
                                                try {
                                                    URL.revokeObjectURL(it.url);
                                                } catch (e) { }
                                            }
                                        });
                                        return prevArr.filter((x) => !x.file);
                                    });
                                }}
                                disabled={uploading}
                            >
                                Clear Previews
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="muted info">{isPublicView ? null : <div className="sign-in-msg">Sign in as the trip owner to add uploads.</div>}</div>
            )}

            <div className="gallery">
                {(Array.isArray(media) ? media : []).map((m) => (
                    <div key={m.id} className="gallery-item">
                        <button
                            type="button"
                            onClick={() => setModalMedia(m)}
                            className="thumb-button"
                            title="Open preview"
                            style={{ border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
                        >
                            {m.type === "image" ? (
                                // For persisted items, m.url should be the latest Storage URL (or empty if still resolving)
                                <img src={m.url || ""} alt={m.name} className="media-thumb" />
                            ) : (
                                <video src={m.url || ""} controls={false} className="media-thumb" />
                            )}
                        </button>

                        {isOwner && (
                            <button onClick={() => removeMedia(m.id)} className="delete-btn" title="Remove">
                                ✕
                            </button>
                        )}
                    </div>
                ))}

                {(!Array.isArray(media) || media.length === 0) && <div className="muted empty-placeholder">No media</div>}

                <ImageModal open={Boolean(modalMedia)} media={modalMedia} onClose={() => setModalMedia(null)} />
            </div>
        </section>
    );
}
