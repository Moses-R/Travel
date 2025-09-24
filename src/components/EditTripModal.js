// src/components/EditTripModal.jsx
import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import "./css/EditTripModal.css";

// Optional Firebase modular imports - only used if `db` prop is provided.
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
} from "firebase/firestore";

/**
 * EditTripModal (handles-only mode)
 *
 * Changes vs previous versions:
 * - Allowed users now accepts ONLY handles that start with "@" (example: @alice, @bob).
 * - Emails and raw UIDs are treated as invalid and highlighted; Save is disabled while invalid tokens exist.
 * - Handles are resolved to UIDs before sending payload.allowedUsers (uses db or resolveHandleToUid prop).
 *
 * Props:
 * - open, trip, ownerUid, db, resolveHandleToUid, resolveUidToHandle, onSave, onClose/onCancel, saving
 */
export default function EditTripModal({
    open,
    trip = null,
    ownerUid = null,
    db = null,
    resolveHandleToUid = null, // async(handleWithoutAt) => uid | null
    resolveUidToHandle = null, // optional for display (not required)
    onClose = undefined,
    onCancel = undefined,
    onSave = async (updatedFields) => { },
    saving = false,
}) {
    // ------------------------
    // Hooks (top-level)
    // ------------------------
    const [form, setForm] = useState({
        trip_id: "",
        title: "",
        start_date: "",
        end_date: "",
        startLocation: "",
        destination: "",
        notes: "",
        visibility: "public",
        allowedUsersText: "",
    });

    const [customMapSrc, setCustomMapSrc] = useState("");
    const [resolvedHandles, setResolvedHandles] = useState([]); // { handle, uid|null, status: 'resolved'|'notfound'|'loading' }
    const [invalidTokens, setInvalidTokens] = useState([]); // tokens that are invalid (not @handle or unresolved)
    const [resolvingAllowedUsers, setResolvingAllowedUsers] = useState(false);

    const resolveTimer = useRef(null);

    // ------------------------
    // Helpers
    // ------------------------
    const update = (patch) => setForm((s) => ({ ...s, ...patch }));

    const handleClose = () => {
        if (typeof onClose === "function") return onClose();
        if (typeof onCancel === "function") return onCancel();
        return undefined;
    };

    const parseTokens = (text) => {
        if (!text) return [];
        return text
            .split(/[\n,]+/)
            .map((t) => t.trim())
            .filter(Boolean);
    };

    const stripAt = (s) => (s.startsWith("@") ? s.slice(1) : s);

    // Robust handle -> uid resolver with normalization + diagnostics
    const defaultResolveHandleToUid = async (handleNoAt) => {
        if (!db || !handleNoAt) {
            console.debug && console.debug("resolveHandleToUid: missing db or handle", { dbPresent: !!db, handleNoAt });
            return null;
        }

        // sanitize and normalize: trim, remove zero-width/BOM, NFKC normalize, lowercase
        const sanitize = (s) =>
            String(s || "")
                .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width + BOM
                .trim()
                .normalize("NFKC")
                .toLowerCase();

        const key = sanitize(handleNoAt);
        if (!key) {
            console.debug && console.debug("resolveHandleToUid: empty after sanitize", { original: handleNoAt });
            return null;
        }

        try {
            // 1) Preferred: doc id lookup in `handles` collection (common pattern: doc id = handle)
            const docRef = doc(db, "handles", key);
            const snap = await getDoc(docRef);
            if (snap.exists && typeof snap.exists === "function") {
                // older SDKs sometimes expose snapshot.exists() - check function
                if (snap.exists()) {
                    const data = snap.data();
                    const uid = data?.uid || data?.userId || data?.id || null;
                    console.debug && console.debug("resolveHandleToUid: found by docId", { key, uid, data });
                    return uid;
                } else {
                    console.debug && console.debug("resolveHandleToUid: no doc at handles/" + key);
                }
            } else if (snap && typeof snap.exists !== "function") {
                // fallback for some SDKs where exists is a boolean property
                if (snap.exists) {
                    const data = snap.data();
                    const uid = data?.uid || data?.userId || data?.id || null;
                    console.debug && console.debug("resolveHandleToUid: found by docId (prop)", { key, uid, data });
                    return uid;
                } else {
                    console.debug && console.debug("resolveHandleToUid: no doc at handles/" + key);
                }
            }

        } catch (err) {
            console.debug && console.debug("resolveHandleToUid: doc lookup error", { key, err });
        }

        try {
            // 2) Fallback: maybe the handle is stored as a field on the handles collection documents
            const q = query(collection(db, "handles"), where("handle", "==", key));
            const snaps = await getDocs(q);
            if (!snaps.empty) {
                const d = snaps.docs[0].data();
                const uid = d?.uid || d?.userId || d?.id || null;
                console.debug && console.debug("resolveHandleToUid: found by handles.handle field", { key, uid, docId: snaps.docs[0].id, data: d });
                return uid;
            } else {
                console.debug && console.debug("resolveHandleToUid: no handles doc with field handle == " + key);
            }
        } catch (err) {
            console.debug && console.debug("resolveHandleToUid: handles field query error", { key, err });
        }

        try {
            // 3) Fallback: maybe users collection contains the handle field
            const q2 = query(collection(db, "users"), where("handle", "==", key));
            const snaps2 = await getDocs(q2);
            if (!snaps2.empty) {
                const d = snaps2.docs[0].data();
                const uid = d?.uid || d?.id || null;
                console.debug && console.debug("resolveHandleToUid: found by users.handle", { key, uid, docId: snaps2.docs[0].id, data: d });
                return uid;
            } else {
                console.debug && console.debug("resolveHandleToUid: no users where handle == " + key);
            }
        } catch (err) {
            console.debug && console.debug("resolveHandleToUid: users query error", { key, err });
        }

        // nothing found
        console.debug && console.debug("resolveHandleToUid: notfound", { key, original: handleNoAt });
        return null;
    };


    // Default UID -> handle resolver (prefer the `handles` collection join)
    const defaultResolveUidToHandle = async (uid) => {
        if (!db || !uid) return null;

        try {
            // 1) Preferred: find doc in `handles` collection where uid == <uid>
            //    This returns the doc id which is usually the handle.
            const q = query(collection(db, "handles"), where("uid", "==", uid));
            const snaps = await getDocs(q);
            if (!snaps.empty) {
                const docRef = snaps.docs[0];
                // prefer doc id (common pattern: doc id = handle)
                if (docRef.id) return docRef.id;
                const dd = docRef.data();
                if (dd && (dd.handle || dd.name)) return dd.handle || dd.name;
            }
        } catch (err) {
            // ignore and try fallback strategies
        }

        try {
            // 2) fallback: check `users` collection doc with id = uid (some projects store handle there)
            const d = await getDoc(doc(db, "users", uid));
            if (d.exists()) {
                const data = d.data();
                if (data && (data.handle || data.username)) return data.handle || data.username;
            }
        } catch (err) {
            // ignore
        }

        try {
            // 3) fallback: query users where uid field equals uid
            const q2 = query(collection(db, "users"), where("uid", "==", uid));
            const snaps2 = await getDocs(q2);
            if (!snaps2.empty) {
                const dd = snaps2.docs[0].data();
                if (dd && (dd.handle || dd.username)) return dd.handle || dd.username;
            }
        } catch (err) {
            // ignore
        }

        return null;
    };

    const resolveHandleToUidFn = typeof resolveHandleToUid === "function" ? resolveHandleToUid : defaultResolveHandleToUid;
    const resolveUidToHandleFn = typeof resolveUidToHandle === "function" ? resolveUidToHandle : defaultResolveUidToHandle;

    // ------------------------
    // Effects
    // ------------------------

    useEffect(() => {
        if (!db || !open) return;

        (async () => {
            try {
                const key = "eric";
                const s1 = await getDoc(doc(db, "handles", key));
                // console.log("doc handles/eric exists:", !!(s1 && typeof s1.exists === "function" ? s1.exists() : s1.exists), s1 && s1.data ? s1.data() : null);

                const snaps = await getDocs(query(collection(db, "handles"), where("handle", "==", key)));
                // console.log("query handles where handle == eric count:", snaps.size, snaps.docs.map(d => ({ id: d.id, data: d.data() })));

                const u = await getDocs(query(collection(db, "users"), where("handle", "==", key)));
                // console.log("query users where handle == eric count:", u.size, u.docs.map(d => ({ id: d.id, data: d.data() })));
            } catch (err) {
                console.error("debug handle lookup error:", err);
            }
        })();

        // remove this effect later; dependencies include db to re-run if db changes
    }, [db, open]);

    // Prefill form from trip; for allowedUsers we want to show handles (with @).
    // If trip.allowedUsers contains UIDs, try to convert them to handles using resolveUidToHandle (if provided),
    // otherwise leave them out and let owner re-enter handles. Owner UID is excluded from textarea.
    useEffect(() => {
        if (!trip) {
            setForm({
                trip_id: "",
                title: "",
                start_date: "",
                end_date: "",
                startLocation: "",
                destination: "",
                notes: "",
                visibility: "public",
                allowedUsersText: "",
            });
            setCustomMapSrc("");
            setResolvedHandles([]);
            setInvalidTokens([]);
            setResolvingAllowedUsers(false);
            return;
        }

        const allowedArr = Array.isArray(trip.allowedUsers)
            ? trip.allowedUsers
            : Array.isArray(trip.allowed_users)
                ? trip.allowed_users
                : [];

        // remove owner
        const filtered = allowedArr.filter((a) => a && a !== ownerUid);

        setResolvingAllowedUsers(true);
        setResolvedHandles([]);
        setInvalidTokens([]);

        (async () => {
            try {
                const results = await Promise.all(
                    filtered.map(async (tok) => {
                        // if the stored value already has a leading @ (unlikely for your data), treat as handle
                        if (typeof tok === "string" && tok.startsWith("@")) {
                            const h = stripAt(tok);
                            return { original: tok, display: `@${h}`, handle: h, uid: null, status: "loading" };
                        }

                        // otherwise tok is expected to be a UID (per your schema). Try to resolve UID -> handle.
                        if (typeof tok === "string") {
                            try {
                                const handle = await resolveUidToHandleFn(tok);
                                if (handle) {
                                    return { original: tok, display: `@${handle}`, handle, uid: tok, status: "resolved" };
                                } else {
                                    // couldn't find a handle for this uid — don't display `@<uid>`
                                    return { original: tok, display: null, handle: null, uid: tok, status: "notfound" };
                                }
                            } catch (err) {
                                return { original: tok, display: null, handle: null, uid: tok, status: "notfound" };
                            }
                        }

                        return { original: tok, display: null, handle: null, uid: tok, status: "notfound" };
                    })
                );

                // Build textarea value from resolved/displayable handles only (exclude notfound)
                const displayList = results.filter((r) => r.display).map((r) => r.display);
                setForm((s) => ({ ...s, allowedUsersText: displayList.join(", ") }));

                setResolvedHandles(
                    results.map((r) => {
                        // r.display existed when we had a handle to show (e.g. "@eric")
                        if (r.display) {
                            // ensure handle field is the plain handle (no @) and original is a visible @handle
                            return {
                                handle: r.handle || stripAt(r.display),
                                uid: r.uid || null,
                                status: r.status === "resolved" ? "resolved" : "loading",
                                original: r.display, // this will be something like "@eric" for visible UI
                            };
                        }
                        // not displayable (no handle found) — keep original (likely UID)
                        return {
                            handle: null,
                            uid: r.uid || null,
                            status: r.status || "notfound",
                            original: r.original,
                        };
                    })
                );


                const invalids = results.filter((r) => !r.display).map((r) => r.original);
                setInvalidTokens(invalids);
            } catch (err) {
                // fallback: don't prefill allowedUsersText
                setForm((s) => ({ ...s, allowedUsersText: "" }));
                setResolvedHandles([]);
                setInvalidTokens([]);
            } finally {
                setResolvingAllowedUsers(false);
            }
        })();

        // other basic fields
        setForm((s) => ({
            ...s,
            trip_id: trip.trip_id || trip.id || "",
            title: trip.title || "",
            start_date: trip.start_date || trip.startDate || "",
            end_date: trip.end_date || trip.endDate || "",
            startLocation: trip.startLocation || trip.start_location || "",
            destination: trip.destination || trip.dest || "",
            notes: trip.notes || trip.tripNotes || "",
            visibility: trip.visibility || (trip.private ? "private" : "public"),
        }));

        const pref = trip.mapIframeSrc || trip.map_iframe_src || "";
        setCustomMapSrc(pref);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trip, ownerUid, resolveUidToHandle]);


    // When user edits the textarea, debounce and attempt to resolve handles -> UIDs.
    useEffect(() => {
        if (resolveTimer.current) clearTimeout(resolveTimer.current);
        const tokens = parseTokens(form.allowedUsersText);

        // Reset preview: parse tokens and mark invalid ones immediately:
        const invalid = [];
        const preview = tokens.map((tok) => {
            if (!tok.startsWith("@")) {
                invalid.push(tok);
                return { handle: null, uid: null, status: "invalid", original: tok };
            }
            const h = stripAt(tok);
            return { handle: h, uid: null, status: "loading", original: tok };
        });

        setResolvedHandles(preview);
        setInvalidTokens(invalid);

        // If no resolver available, mark loading tokens as "notfound" (invalid) after short timeout
        if (!resolveHandleToUidFn) {
            setResolvedHandles((prev) => prev.map((p) => (p.status === "loading" ? { ...p, status: "notfound" } : p)));
            setInvalidTokens((prev) => [
                ...new Set([...prev, ...preview.filter((p) => p.status === "loading").map((p) => p.original)]),
            ]);
            return;
        }

        resolveTimer.current = setTimeout(async () => {
            // try to resolve each handle (without @) to uid
            setResolvingAllowedUsers(true);
            const toResolve = preview.filter((p) => p.status === "loading");

            const results = await Promise.all(
                toResolve.map(async (p) => {
                    try {
                        const uid = await resolveHandleToUidFn(p.handle);
                        if (uid) return { ...p, uid, status: "resolved" };
                        return { ...p, uid: null, status: "notfound" };
                    } catch (err) {
                        return { ...p, uid: null, status: "notfound" };
                    }
                })
            );

            // merge results back into resolvedHandles
            const merged = preview.map((p) => {
                const r = results.find((res) => res.original === p.original);
                return r || p;
            });

            setResolvedHandles(merged);

            // invalid tokens are those not starting with @ OR those with status notfound
            const invalidAfter = merged.filter((m) => m.status === "invalid" || m.status === "notfound").map((m) => m.original);
            setInvalidTokens(invalidAfter);

            setResolvingAllowedUsers(false);
        }, 350);

        return () => {
            if (resolveTimer.current) clearTimeout(resolveTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.allowedUsersText]);

    // ------------------------
    // Render bail-out: hooks already executed
    // ------------------------
    if (!open) return null;

    // ------------------------
    // Map helpers (unchanged)
    // ------------------------
    const buildAutoMapSrc = () => {
        const origin = (form.startLocation || "").trim();
        const dest = (form.destination || "").trim();
        const qEncode = (s) => encodeURIComponent(s);

        if (dest) return `https://www.google.com/maps?q=${qEncode(dest)}&output=embed`;
        if (origin) return `https://www.google.com/maps?q=${qEncode(origin)}&output=embed`;
        if (origin || dest) {
            const combined = `${origin} to ${dest}`.trim();
            if (combined) return `https://www.google.com/maps?q=${qEncode(combined)}&output=embed`;
        }
        return null;
    };

    const extractSrcFromIframe = (input) => {
        if (!input) return "";
        const match = input.match(/src=(?:"|')([^"']+)(?:"|')/i);
        if (match && match[1]) return match[1];
        if (/^https?:\/\//i.test(input.trim())) return input.trim();
        return "";
    };

    const finalMapSrc = (() => {
        const extracted = extractSrcFromIframe(customMapSrc);
        if (extracted) return extracted;
        return buildAutoMapSrc();
    })();

    const clearCustomMap = () => setCustomMapSrc("");

    // ------------------------
    // Submit handler (only handles allowed)
    // ------------------------
    const handleSubmit = async (e) => {
        e?.preventDefault?.();

        if (!form.title?.trim()) {
            return alert("Please provide a title for the trip.");
        }

        // If there are invalid tokens, prevent submit (extra guard)
        if (invalidTokens && invalidTokens.length > 0) {
            return alert("Please remove or fix invalid tokens (only @handles are allowed).");
        }

        const payload = {
            trip_id: form.trip_id,
            title: form.title.trim(),
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            startLocation: form.startLocation || null,
            destination: form.destination || null,
            notes: form.notes || null,
            visibility: form.visibility || "public",
        };

        if (form.visibility === "restricted") {
            // Collect uids from resolvedHandles (only resolved ones)
            const uidSet = new Set();
            if (ownerUid) uidSet.add(ownerUid);

            for (const r of resolvedHandles) {
                if (!r || !r.original) continue;
                // require r.original to start with @ and be resolved
                if (r.original.startsWith("@") && r.status === "resolved" && r.uid) {
                    uidSet.add(r.uid);
                } else {
                    // any other case should have been blocked earlier - but skip
                }
            }

            payload.allowedUsers = Array.from(uidSet);
        } else {
            payload.allowedUsers = [];
        }

        // optionally include map iframe
        // payload.mapIframeSrc = customMapSrc || undefined;

        try {
            await onSave(payload);
        } catch (err) {
            console.error("EditTripModal onSave error:", err);
        }
    };

    // ------------------------
    // Small UI helpers
    // ------------------------
    const renderResolvedPreview = () => {
        if (form.visibility !== "restricted") return null;

        const labelFor = (t) => {
            if (t && t.handle) return `@${t.handle}`;
            if (t && t.original && String(t.original).startsWith("@")) return t.original;
            return t && t.original ? String(t.original) : "@unknown";
        };

        return (
            <div style={{ marginTop: 8 }}>
                {resolvingAllowedUsers ? (
                    <div style={{ color: "#9aa0b4", fontSize: 13 }}>Resolving handles… (only @handles allowed)</div>
                ) : null}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {resolvedHandles.length === 0 ? (
                        <div className="muted" style={{ marginTop: 8 }}>No handles entered.</div>
                    ) : (
                        resolvedHandles.map((t, i) => {
                            if (!t) return null;
                            const key = `${t.original || t.handle || i}-${i}`;

                            // compute state string used for styling: resolved / loading / invalid
                            const state = t.status === "resolved" && t.uid ? "resolved"
                                : t.status === "loading" ? "loading"
                                    : (t.status === "notfound" || t.status === "invalid") ? "invalid"
                                        : "unknown";

                            // visible label (never show UID)
                            const label = labelFor(t) + (state === "loading" ? " (resolving…)" : (state === "invalid" ? " (not found)" : ""));

                            return (
                                <div
                                    key={key}
                                    className="handle-chip"
                                    data-state={state}
                                    title={state === "resolved" ? "Resolved" : undefined}
                                    style={{ fontSize: 13 }}
                                    aria-live="polite"
                                >
                                    {label}
                                </div>
                            );
                        })
                    )}
                </div>

                {invalidTokens && invalidTokens.length > 0 ? (
                    <div style={{ color: "#ff6b6b", marginTop: 8, fontSize: 13 }}>
                        Invalid entries: {invalidTokens.join(", ")} — only <strong>@handles</strong> are allowed (remove or fix them).
                    </div>
                ) : null}
            </div>
        );
    };

    // ------------------------
    // JSX
    // ------------------------
    return (
        <Modal title="Edit Trip" onClose={handleClose}>
            <form className="edit-trip-form" onSubmit={handleSubmit}>
                <label className="field">
                    <div className="label">Title</div>
                    <input
                        value={form.title}
                        onChange={(e) => update({ title: e.target.value })}
                        required
                        placeholder="Trip title"
                    />
                </label>

                <div style={{ display: "flex", gap: 8 }}>
                    <label className="field" style={{ flex: 1 }}>
                        <div className="label">Start date</div>
                        <input
                            type="date"
                            value={form.start_date || ""}
                            onChange={(e) => update({ start_date: e.target.value })}
                        />
                    </label>

                    <label className="field" style={{ flex: 1 }}>
                        <div className="label">End date</div>
                        <input
                            type="date"
                            value={form.end_date || ""}
                            onChange={(e) => update({ end_date: e.target.value })}
                        />
                    </label>
                </div>

                <label className="field">
                    <div className="label">Start location</div>
                    <input
                        value={form.startLocation || ""}
                        onChange={(e) => update({ startLocation: e.target.value })}
                        placeholder="City, station, etc."
                    />
                </label>

                <label className="field">
                    <div className="label">Destination</div>
                    <input
                        value={form.destination || ""}
                        onChange={(e) => update({ destination: e.target.value })}
                        placeholder="City, station, etc."
                    />
                </label>

                <label className="field">
                    <div className="label">Visibility</div>
                    <select value={form.visibility} onChange={(e) => update({ visibility: e.target.value })}>
                        <option value="public">Public</option>
                        <option value="restricted">Restricted</option>
                        <option value="private">Private</option>
                    </select>
                </label>

                {form.visibility === "restricted" && (
                    <label className="field">
                        <div className="label">Allowed users</div>
                        <small className="muted" style={{ display: "block", marginBottom: 6 }}>
                            Enter <strong>handles with leading "@"</strong> only (example: <code>@alice, @bob</code>).
                        </small>
                        <textarea
                            value={form.allowedUsersText || ""}
                            onChange={(e) => update({ allowedUsersText: e.target.value })}
                            placeholder='@alice, @bob (only handles with "@")'
                            rows={3}
                        />
                        {renderResolvedPreview()}
                    </label>
                )}

                <label className="field">
                    <div className="label">Notes</div>
                    <textarea
                        value={form.notes || ""}
                        onChange={(e) => update({ notes: e.target.value })}
                        placeholder="Notes, stops, highlights..."
                        rows={4}
                    />
                </label>

                <div className="field" style={{ marginTop: 8 }}>
                    <div className="label">Map preview</div>

                    <small className="muted" style={{ display: "block", marginBottom: 6 }}>
                        The map below updates automatically (destination preferred). Paste an iframe tag or the iframe <code>src</code> URL here to override the map preview.
                    </small>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input
                            type="text"
                            placeholder='Paste iframe tag or src URL to override (optional)'
                            value={customMapSrc}
                            onChange={(e) => setCustomMapSrc(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <button type="button" onClick={clearCustomMap} className="btn-cancel" disabled={!customMapSrc}>
                            Clear
                        </button>
                    </div>

                    <div style={{ border: "1px solid #e1e1e1", borderRadius: 8, overflow: "hidden" }}>
                        {finalMapSrc ? (
                            <iframe title="trip-map" src={finalMapSrc} style={{ width: "100%", height: 300, border: 0 }} loading="lazy" />
                        ) : (
                            <div className="muted" style={{ padding: 12 }}>
                                No map available. Enter a destination or start location above, or paste a valid iframe URL.
                            </div>
                        )}
                    </div>

                    <small className="muted" style={{ display: "block", marginTop: 6 }}>
                        Note: only @handles are accepted for restricted visibility.
                    </small>
                </div>

                <div className="modal-actions" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button type="button" className="btn-cancel" onClick={handleClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn-save"
                        disabled={saving || (invalidTokens && invalidTokens.length > 0) || resolvingAllowedUsers}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
