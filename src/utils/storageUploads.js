// src/utils/storageUploads.js
import exifr from "exifr";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, setDoc, addDoc, collection, getDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "../firebase";

/**
 * Upload one file to Firebase Storage and persist metadata to Firestore
 * under trips/{tripId}/media/{mediaId}.
 *
 * Returns an object:
 * {
 *   id, name, mime, size, type, storagePath, url, date, gps, uploadedBy,
 *   clientCreatedAt, uploadedAt (ISO or null), _firestorePersisted: boolean,
 *   _firestoreError?: string
 * }
 */
export async function uploadFileAndSaveMeta(file, tripId, user, onProgress) {
    if (!user || !user.uid) throw new Error("User must be authenticated");
    if (!tripId) throw new Error("tripId required");
    if (!storage) throw new Error("Firebase Storage not initialized");
    if (!db) throw new Error("Firestore not initialized");

    // 1) Attempt EXIF extraction (best-effort)
    let captureDate = null;
    let gps = null;
    try {
        if (file.type && file.type.startsWith("image")) {
            const exif = await exifr.parse(file, { tiff: true, exif: true, gps: true });
            if (exif) {
                if (exif.DateTimeOriginal) {
                    captureDate = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : String(exif.DateTimeOriginal);
                } else if (exif.CreateDate) {
                    captureDate = exif.CreateDate instanceof Date ? exif.CreateDate.toISOString() : String(exif.CreateDate);
                }
                if (typeof exif.latitude === "number" && typeof exif.longitude === "number") {
                    gps = { lat: exif.latitude, lng: exif.longitude };
                } else if (exif.gps && exif.gps.latitude && exif.gps.longitude) {
                    gps = { lat: exif.gps.latitude, lng: exif.gps.longitude };
                }
            }
        }
    } catch (exifErr) {
        console.warn("exifr parse failed (continuing):", exifErr);
    }

    // 2) Upload to Storage
    const safeName = (file.name || `file-${Date.now()}`).replace(/\s+/g, "_");
    const storagePath = `${user.uid}/trips/${tripId}/${Date.now()}_${safeName}`;
    const ref = storageRef(storage, storagePath);
    const uploadTask = uploadBytesResumable(ref, file);

    const snapshot = await new Promise((resolve, reject) => {
        uploadTask.on(
            "state_changed",
            (snap) => {
                const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
                if (typeof onProgress === "function") onProgress(pct);
            },
            (err) => reject(err),
            () => resolve(uploadTask.snapshot)
        );
    });

    // get public download URL (this may throw if object doesn't allow read)
    const url = await getDownloadURL(snapshot.ref);

    // 3) Compose media metadata
    // Use a client id, but we also include clientCreatedAt to avoid ordering issues.
    const mediaId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientCreatedAt = new Date().toISOString();
    const mediaDoc = {
        id: mediaId,
        name: file.name || safeName,
        mime: file.type || "application/octet-stream",
        size: file.size || 0,
        type: file.type && file.type.startsWith("video") ? "video" : "image",
        storagePath,
        url,
        date: captureDate || clientCreatedAt,
        gps: gps || null,
        uploadedBy: user.uid,
        clientCreatedAt,
        // Note: uploadedAt will be serverTimestamp() applied on write
    };

    // 4) Persist to Firestore with retries.
    const mediaDocRef = doc(db, "trips", tripId, "media", mediaId);

    // attempt to setDoc, if permissions or rules block id-based writes, fallback to addDoc to let server generate an id.
    const maxRetries = 2;
    let attempt = 0;
    let lastError = null;
    let persistedDocId = null;

    while (attempt <= maxRetries) {
        try {
            attempt++;
            // prefer setDoc to keep the id stable; this may fail if your rules prevent client-chosen ids
            await setDoc(mediaDocRef, { ...mediaDoc, uploadedAt: serverTimestamp() });
            persistedDocId = mediaId;
            lastError = null;
            break;
        } catch (err) {
            lastError = err;
            // If permission denied or some security rule blocks setDoc with client id, try addDoc (server-generated id)
            // For other transient errors, try again with exponential backoff
            const isPermission = err && (String(err.code || "").toLowerCase().includes("permission") || String(err.message || "").toLowerCase().includes("permission") || String(err.message || "").toLowerCase().includes("auth"));
            if (isPermission) {
                try {
                    // fallback: addDoc under the collection (server id)
                    const collRef = collection(db, "trips", tripId, "media");
                    const addedRef = await addDoc(collRef, { ...mediaDoc, uploadedAt: serverTimestamp() });
                    persistedDocId = addedRef.id;
                    lastError = null;
                    break;
                } catch (addErr) {
                    lastError = addErr;
                    // if addDoc failed due to permission too, break retry loop
                    if (attempt > maxRetries) break;
                }
            }

            // for transient errors, do a small backoff before retrying
            const backoffMs = 200 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, backoffMs));
        }
    }

    // 5) If persistence failed, optionally cleanup the uploaded storage object to avoid orphan files
    if (!persistedDocId) {
        // try best-effort delete of the uploaded storage object; ignore errors
        try {
            await deleteObject(ref).catch((err) => {
                console.warn("Failed to delete uploaded storage object after Firestore persist failure:", err);
            });
        } catch (e) {
            // pass
        }

        return {
            ...mediaDoc,
            uploadedAt: new Date().toISOString(),
            _firestorePersisted: false,
            _firestoreError: lastError ? String(lastError.message || lastError) : "unknown",
        };
    }

    // 6) Read the saved doc to obtain server timestamp if available
    try {
        const persistedRef = doc(db, "trips", tripId, "media", persistedDocId);
        const persistedSnap = await getDoc(persistedRef);
        const savedData = persistedSnap.exists() ? persistedSnap.data() : null;
        let uploadedAtISO = null;
        try {
            const uploadedAtTs = savedData?.uploadedAt;
            uploadedAtISO = uploadedAtTs && typeof uploadedAtTs.toDate === "function" ? uploadedAtTs.toDate().toISOString() : (uploadedAtTs || null);
        } catch (e) {
            uploadedAtISO = null;
        }

        return {
            id: persistedDocId,
            ...mediaDoc,
            uploadedAt: uploadedAtISO || new Date().toISOString(),
            _firestorePersisted: true,
        };
    } catch (finalReadErr) {
        // Persisted but read-back failed — still report persisted true, but include read error
        return {
            id: persistedDocId,
            ...mediaDoc,
            uploadedAt: new Date().toISOString(),
            _firestorePersisted: true,
            _firestoreReadError: String(finalReadErr.message || finalReadErr),
        };
    }
}
