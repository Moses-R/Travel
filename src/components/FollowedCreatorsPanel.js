// src/components/FollowedCreatorsPanel.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    getDoc
} from "firebase/firestore";
import { normalizeHandle } from "../utils/handle";

/**
 * Shows the creators the current user follows.
 * Expects top-level "follows" docs with fields: { followerId, followeeId, createdAt }
 *
 * Usage: <FollowedCreatorsPanel /> (you've already imported it in Home.jsx)
 */
export default function FollowedCreatorsPanel({ db, limit = 6 }) {
    const { currentUser } = useAuth();
    const firestore = db || getFirestore();

    const [creators, setCreators] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setCreators([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        let unsub = () => { };
        let cancelled = false;

        try {
            // listen for follows where followerId == currentUser.uid
            // order by createdAt so we can show newest follows first (or change direction)
            const q = query(
                collection(firestore, "follows"),
                where("followerId", "==", currentUser.uid)
            );


            unsub = onSnapshot(
                q,
                async (snap) => {
                    if (cancelled) return;

                    const followDocs = [];
                    snap.forEach((d) => followDocs.push({ id: d.id, ...d.data() }));

                    if (followDocs.length === 0) {
                        setCreators([]);
                        setLoading(false);
                        return;
                    }

                    // fetch each followee user doc directly to preserve order (and avoid 'in' limits)
                    // parallelize requests with Promise.all
                    try {
                        const userPromises = followDocs.map(async (f) => {
                            try {
                                const uRef = doc(firestore, "users", f.followeeId);
                                const uSnap = await getDoc(uRef);
                                if (uSnap.exists()) {
                                    return { id: uSnap.id, ...uSnap.data(), followedAt: f.createdAt || null };
                                }
                                return null;
                            } catch (err) {
                                console.warn("Failed to load user", f.followeeId, err);
                                return null;
                            }
                        });

                        const usersResolved = (await Promise.all(userPromises)).filter(Boolean);

                        // keep order same as followDocs (already mapped)
                        const usersMap = new Map(usersResolved.map((u) => [u.id, u]));
                        const ordered = followDocs
                            .map((f) => usersMap.get(f.followeeId))
                            .filter(Boolean)
                            .slice(0, limit);

                        if (!cancelled) {
                            setCreators(ordered);
                        }
                    } catch (err) {
                        console.error("Error loading followees' user docs", err);
                        if (!cancelled) setCreators([]);
                    } finally {
                        if (!cancelled) setLoading(false);
                    }
                },
                (err) => {
                    console.error("FollowedCreatorsPanel onSnapshot error:", err);
                    if (!cancelled) {
                        setLoading(false);
                        setCreators([]);
                    }
                }
            );
        } catch (err) {
            console.error("FollowedCreatorsPanel setup error:", err);
            setLoading(false);
        }

        return () => {
            cancelled = true;
            try {
                unsub();
            } catch (e) { }
        };
    }, [currentUser, firestore, limit]);

    // buildTravelPath: prefer handle if available, otherwise use the user's id as slug
    const buildTravelPath = (u) => {
        // prefer handle; normalize it and prefix with @ as your router expects
        if (u?.handle) {
            const normalized = normalizeHandle(u.handle);
            if (normalized) {
                return `/Travel/@${encodeURIComponent(normalized)}`;
            }
        }
        // fallback to using id as slug (TravelPageWithHandle handles it)
        return `/Travel/${encodeURIComponent(u.id)}`;
    };

    return (
        <div className="card small">
            <h4 style={{ marginTop: 0 }}>Following</h4>

            {loading ? (
                Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
                    <div className="skel" style={{ height: 52, marginBottom: 8 }} key={i} />
                ))
            ) : creators.length === 0 ? (
                <div style={{ color: "#6b7280" }}>
                    {currentUser ? "You’re not following anyone yet." : "Log in to see creators you follow."}
                </div>
            ) : (
                <div style={{ marginTop: 8 }}>
                    {creators.map((u) => (
                        <div
                            key={u.id}
                            style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                padding: "8px 0",
                            }}
                        >
                            <img
                                src={u.photoURL || u.avatar || "/default-avatar.png"}
                                alt={u.displayName || u.name || ""}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 8,
                                    objectFit: "cover",
                                }}
                            />
                            <div style={{ flex: 1 }}>
                                <Link
                                    to={buildTravelPath(u)}
                                    style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}
                                >
                                    {u.displayName || u.name || u.handle || "—"}
                                </Link>
                                <div style={{ color: "#6b7280", fontSize: 13 }}>
                                    {u.handle ? `@${u.handle}` : ""}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
