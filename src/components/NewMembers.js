// src/components/NewMembers.js
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    collection,
    query,
    limit as limitQuery,
    onSnapshot,
    getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeHandle } from "../utils/handle";

/**
 * NewMembers
 *
 * - Shows a single member at a time (name + @handle)
 * - Animates each entry (slide+fade) and automatically moves to the next one
 *
 * Props:
 * - limit (number): how many recent users to fetch (default 5)
 * - intervalMs (number): milliseconds between auto-advance (default 3500)
 * - pauseOnHover (bool): pause cycling while hovered (default true)
 * - onViewAll (func): optional callback for Browse all creators button
 */
export default function NewMembers({
    limit = 5,
    intervalMs = 3500,
    pauseOnHover = true,
    onViewAll,
}) {
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // index of currently visible user
    const [index, setIndex] = useState(0);
    const intervalRef = useRef(null);
    const pausedRef = useRef(false);

    // helper to normalise createdAt (Timestamp or string)
    function parseCreatedAt(raw) {
        if (!raw) return 0;
        if (typeof raw?.toMillis === "function") return raw.toMillis();
        const t = Date.parse(raw);
        if (!isNaN(t)) return t;
        try {
            const fallback = raw.replace(/ at /g, " ").replace(/ UTC.*$/, "Z");
            const p = Date.parse(fallback);
            return isNaN(p) ? 0 : p;
        } catch {
            return 0;
        }
    }

    // fetch / subscribe users (self-contained)
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        try {
            const q = query(collection(db, "users"), limitQuery(Math.max(limit, 1)));
            const unsub = onSnapshot(
                q,
                (snap) => {
                    if (cancelled) return;
                    const arr = snap.docs
                        .map((d) => {
                            const data = d.data() || {};
                            // normalise fields we care about
                            const name = data.displayName || data.name || data.handle || "—";
                            const handle =
                                (data.handle && String(data.handle).replace(/^@/, "")) ||
                                (data.email ? String(data.email).split("@")[0] : "");
                            return {
                                id: d.id,
                                name,
                                handle: handle || name.replace(/\s+/g, "").toLowerCase(),
                                createdAtMillis: parseCreatedAt(data.createdAt || data.updatedAt),
                                raw: data,
                            };
                        })
                        .sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));

                    if (!cancelled) {
                        setUsers(arr);
                        setLoading(false);
                        // clamp index to valid range
                        setIndex((cur) => (arr.length === 0 ? 0 : Math.min(cur, Math.max(0, arr.length - 1))));
                    }
                },
                (err) => {
                    console.error("NewMembers onSnapshot error:", err);
                    if (cancelled) return;
                    // fallback to getDocs
                    (async () => {
                        try {
                            const snap = await getDocs(collection(db, "users"));
                            const arr = snap.docs
                                .map((d) => {
                                    const data = d.data() || {};
                                    const name = data.displayName || data.name || data.handle || "—";
                                    const handle =
                                        (data.handle && String(data.handle).replace(/^@/, "")) ||
                                        (data.email ? String(data.email).split("@")[0] : "");
                                    return {
                                        id: d.id,
                                        name,
                                        handle: handle || name.replace(/\s+/g, "").toLowerCase(),
                                        createdAtMillis: parseCreatedAt(data.createdAt || data.updatedAt),
                                        raw: data,
                                    };
                                })
                                .sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
                            if (!cancelled) setUsers(arr);
                        } catch (e) {
                            console.error("NewMembers getDocs fallback failed:", e);
                            if (!cancelled) setError("Failed to load new members.");
                        } finally {
                            if (!cancelled) setLoading(false);
                        }
                    })();
                }
            );

            return () => {
                cancelled = true;
                try {
                    unsub();
                } catch (e) {
                    /* ignore */
                }
            };
        } catch (err) {
            console.error("NewMembers setup failed:", err);
            setError("Failed to load new members.");
            setUsers([]);
            setLoading(false);
        }
        // re-run if limit changes
    }, [limit]);

    // advance index
    const advance = useCallback(() => {
        setIndex((i) => {
            if (!users || users.length <= 1) return 0;
            return (i + 1) % users.length;
        });
    }, [users]);

    // interval management
    useEffect(() => {
        // clear existing
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (!users || users.length <= 1) return undefined;

        intervalRef.current = setInterval(() => {
            if (!pausedRef.current) advance();
        }, Math.max(800, intervalMs));

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [users, intervalMs, advance]);

    // pause/resume handlers
    const onMouseEnter = () => {
        if (pauseOnHover) pausedRef.current = true;
    };
    const onMouseLeave = () => {
        if (pauseOnHover) pausedRef.current = false;
    };

    const visible = users.slice(0, limit);

    // build travel profile URL or fallback
    const toProfilePath = (u) => {
        if (!u) return `/users/${u?.id || ""}`;
        const candidate = normalizeHandle(u.handle || "");
        if (candidate) {
            return `/Travel/@${candidate}`;
        }
        // fallback to user id route if handle can't be normalized
        return `/users/${u.id}`;
    };

    // styling for the in/out animation (fade+slide)
    const wrapperStyle = {
        minHeight: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 6px",
    };

    const textStyle = {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
    };

    // accessible live region: announce user change
    const announce = `${visible.length > 0 ? visible[index]?.name : ""} ${visible.length > 0 ? "@" + visible[index]?.handle : ""}`;

    return (
        <div
            className="card small"
            data-testid="new-members-card"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{ position: "relative", overflow: "hidden" }}
        >
            <h4 style={{ marginTop: 0 }}>New members</h4>

            {loading ? (
                <div style={{ paddingTop: 8 }}>
                    <div className="skel" style={{ height: 44, borderRadius: 8 }} aria-hidden="true" />
                </div>
            ) : error ? (
                <div style={{ color: "#ef4444", paddingTop: 8 }}>{error}</div>
            ) : visible.length === 0 ? (
                <div style={{ color: "#6b7280", paddingTop: 8 }}>No new members yet.</div>
            ) : (
                <>
                    <div style={wrapperStyle} aria-live="polite" aria-atomic="true">
                        {/* Keyed by index so React remounts on change and re-triggers animation */}
                        <div
                            key={visible[index]?.id || index}
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                animation: "nm-slide-in 420ms ease",
                            }}
                        >
                            <div style={textStyle}>
                                <Link
                                    to={toProfilePath(visible[index])}
                                    style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}
                                >
                                    {visible[index].name}
                                </Link>
                                <div style={{ color: "#6b7280", fontSize: 13 }}>@{visible[index].handle}</div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <button
                                    onClick={() => navigate(toProfilePath(visible[index]))}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: "var(--accent)",
                                        cursor: "pointer",
                                        padding: 4,
                                        fontSize: 13,
                                    }}
                                    aria-label={`Open ${visible[index].name}`}
                                >
                                    View
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* aria-only live announcement (also helps screen readers) */}
                    <div style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }} aria-live="polite">
                        {announce}
                    </div>
                </>
            )}

            <div style={{ textAlign: "center", marginTop: 8 }}>
                {onViewAll ? (
                    <button
                        onClick={onViewAll}
                        className="link"
                        style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            color: "var(--accent)",
                            textDecoration: "none",
                        }}
                    >
                        Browse all creators
                    </button>
                ) : (
                    <Link to="/users" style={{ color: "var(--accent)", textDecoration: "none" }}>
                        Browse all creators
                    </Link>
                )}
            </div>

            {/* component-local keyframes so no external CSS needed */}
            <style>{`
        @keyframes nm-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
