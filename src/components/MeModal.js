// src/components/MeModal.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";
import { ensureAt, normalizeHandle, isHandleAvailable, debounce } from "../utils/handle";
import { containsProfanity } from "../utils/profanity";

/**
 * MeModal - edit displayName + handle only
 */
export default function MeModal({
    open,
    onClose,
    profile = {},
    currentUser = {},
    onSave,
}) {
    // Hooks: declared unconditionally
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({ displayName: "", handle: "" });

    const [availability, setAvailability] = useState({ checking: false, available: null });
    const latestCheckHandle = useRef(null);

    // initial values derived from props
    const initial = useMemo(() => {
        const photoURL = profile.photoURL || currentUser.photoURL || "";
        const displayName = profile.displayName || currentUser.displayName || "";
        const email = profile.email || currentUser.email || "";
        const handle = profile.handle || (currentUser.email ? currentUser.email.split("@")[0] : "");
        const role = profile.role || "user";
        const uid = profile.uid || currentUser?.uid || profile?.id || null;
        return { photoURL, displayName, email, handle, role, uid };
    }, [profile, currentUser]);

    // stable debounced checker
    const runCheckRef = useRef(null);
    if (!runCheckRef.current) {
        runCheckRef.current = debounce(async (raw) => {
            const normalized = normalizeHandle(raw);
            if (!normalized) {
                setAvailability({ checking: false, available: null });
                return;
            }

            const initNormalized = normalizeHandle(initial.handle || "");
            if (initNormalized && normalized === initNormalized) {
                setAvailability({ checking: false, available: true });
                return;
            }

            latestCheckHandle.current = normalized;
            setAvailability({ checking: true, available: null });

            try {
                const ok = await isHandleAvailable(normalized);
                if (latestCheckHandle.current === normalized) {
                    setAvailability({ checking: false, available: !!ok });
                }
            } catch (e) {
                console.error("handle availability check error", e);
                if (latestCheckHandle.current === normalized) {
                    setAvailability({ checking: false, available: null });
                }
            }
        }, 350);
    }
    const runCheck = runCheckRef.current;

    // Effects: declared unconditionally
    useEffect(() => {
        if (open) {
            setEditing(false);
            setSaving(false);
            setError("");
            setForm({ displayName: initial.displayName, handle: initial.handle });
            setAvailability({ checking: false, available: null });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initial.displayName, initial.handle]);

    useEffect(() => {
        const raw = (form.handle || "").trim();
        if (!raw) {
            setAvailability({ checking: false, available: null });
            return;
        }
        runCheck(raw);
    }, [form.handle, runCheck]);

    if (!open) return null;

    const photoURL = initial.photoURL;
    const email = initial.email || "No email";
    const role = initial.role;
    const uid = initial.uid;

    // Prefer local form state for shown handle/displayName so optimistic updates reflect immediately
    const shownHandle = (form.handle || initial.handle) ? ensureAt(form.handle || initial.handle) : "—";
    const shownDisplayName = form.displayName || initial.displayName || "No name";

    // owner check - accept profile doc id or profile.uid
    const uidFromProfile = profile?.uid || profile?.id || profile?.docId || initial.uid || null;
    const authUid = currentUser?.uid || null;
    const isOwner = Boolean(authUid && uidFromProfile && authUid === uidFromProfile);

    const validateLocal = () => {
        setError("");
        const name = (form.displayName || "").trim();
        const rawHandle = (form.handle || "").trim();

        if (!name) {
            setError("Display name cannot be empty.");
            return false;
        }

        if (containsProfanity(name)) {
            setError("Display name contains inappropriate words.");
            return false;
        }

        if (containsProfanity(rawHandle)) {
            setError("Handle contains inappropriate words.");
            return false;
        }

        const normalized = normalizeHandle(rawHandle);
        if (!normalized) {
            setError("Handle is in an invalid format.");
            return false;
        }

        if (availability.available === false) {
            setError("Handle is already taken.");
            return false;
        }

        if (availability.checking) {
            setError("Checking handle availability, please wait.");
            return false;
        }

        return true;
    };

    const handleSave = async () => {
        if (!validateLocal()) return;

        setSaving(true);
        setError("");

        const normalizedHandle = normalizeHandle(form.handle);

        const updatedProfile = {
            ...profile,
            displayName: form.displayName.trim(),
            handle: normalizedHandle,
            updatedAt: new Date().toISOString(),
            uid: initial.uid || profile?.uid || currentUser?.uid,
        };

        try {
            if (typeof onSave === "function") {
                await onSave(updatedProfile); // parent is expected to persist and may dispatch event
            } else {
                window.dispatchEvent(new CustomEvent("jift:updateProfile", { detail: updatedProfile }));
            }

            // Optimistic UI update: ensure modal shows new values immediately
            setForm({
                displayName: updatedProfile.displayName,
                handle: updatedProfile.handle,
            });
            setAvailability({ checking: false, available: true });
            setEditing(false);

            // Notify app layers that profile changed
            window.dispatchEvent(new CustomEvent("jift:profileUpdated", { detail: updatedProfile }));
        } catch (err) {
            console.error("Save failed:", err);
            setError(err?.message || "Failed to save profile.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} title="Your profile">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 340 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {photoURL ? (
                        <img src={photoURL} alt="avatar" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover" }} />
                    ) : (
                        <div style={{ width: 72, height: 72, borderRadius: 12, background: "#eee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                            {shownDisplayName ? shownDisplayName.charAt(0).toUpperCase() : "U"}
                        </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{shownDisplayName}</div>
                        <div style={{ color: "#666", marginTop: 4 }}>{shownHandle}</div>
                        <div style={{ color: "#999", marginTop: 6, fontSize: 13 }}>{role}</div>
                    </div>
                </div>

                <hr style={{ margin: "8px 0", border: "none", borderTop: "1px solid #eee" }} />

                {!editing && (
                    <>
                        <div style={{ display: "grid", gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, color: "#666" }}>Email</div>
                                <div style={{ marginTop: 6 }}>{email}</div>
                            </div>

                            <div>
                                <div style={{ fontSize: 12, color: "#666" }}>Handle</div>
                                <div style={{ marginTop: 6 }}>{shownHandle}</div>
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                            <button type="button" className="theme-btn" onClick={() => setEditing(true)}>Edit profile</button>
                            <button type="button" className="theme-btn primary" onClick={onClose}>Close</button>
                        </div>
                    </>
                )}

                {editing && (
                    <>
                        <div style={{ display: "grid", gap: 10 }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 12, color: "#666" }}>Display name</span>
                                <input value={form.displayName} onChange={(e) => setForm(s => ({ ...s, displayName: e.target.value }))} placeholder="Your name" type="text" />
                            </label>

                            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 12, color: "#666" }}>Handle</span>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ color: "#666" }}>@</span>
                                    <input value={form.handle} onChange={(e) => setForm(s => ({ ...s, handle: e.target.value }))} placeholder="your-handle" type="text" />
                                    <div style={{ marginLeft: 6, minWidth: 110 }}>
                                        {availability.checking && <span style={{ fontSize: 12, color: "#888" }}>Checking…</span>}
                                        {availability.available === true && <span style={{ fontSize: 12, color: "green" }}>Available</span>}
                                        {availability.available === false && <span style={{ fontSize: 12, color: "#c52828" }}>Taken</span>}
                                    </div>
                                </div>
                            </label>

                            <div>
                                <div style={{ fontSize: 12, color: "#666" }}>Email (read-only)</div>
                                <div style={{ marginTop: 6 }}>{email}</div>
                            </div>

                            {error && <div style={{ color: "var(--danger, #c52828)", fontSize: 13 }}>{error}</div>}
                        </div>

                        {!isOwner && (
                            <div style={{ color: "#c52828", fontSize: 13 }}>
                                You are not signed in as this user — sign in with the account that owns this profile to edit.
                            </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                            <button type="button" className="theme-btn" onClick={() => { setEditing(false); setError(""); }} disabled={saving}>Cancel</button>

                            <button
                                type="button"
                                className="theme-btn primary"
                                onClick={handleSave}
                                disabled={saving || availability.available === false || availability.checking || !isOwner}
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

MeModal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    profile: PropTypes.object,
    currentUser: PropTypes.object,
    onSave: PropTypes.func,
};

MeModal.defaultProps = {
    open: false,
    profile: {},
    currentUser: {},
    onSave: null,
};
