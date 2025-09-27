// src/hooks/useStats.js
import { useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot, getFirestore } from "firebase/firestore";
import { db as exportedDb } from "../firebase"; // use whatever your firebase file exports

export default function useStats() {
    const [stats, setStats] = useState({ users: 0, publicTrips: 0 });
    const [loading, setLoading] = useState({ users: true, publicTrips: true });
    const mounted = useRef(true);

    // Resolve a usable Firestore instance (prefer the exported one, fall back to getFirestore())
    const getDb = () => {
        if (exportedDb) return exportedDb;
        try {
            const fallback = getFirestore(); // will use the default app
            console.warn("[useStats] Using fallback getFirestore() instance (exported db was falsy).");
            return fallback;
        } catch (err) {
            console.error("[useStats] No Firestore instance available:", err);
            return null;
        }
    };

    useEffect(() => {
        mounted.current = true;
        const db = getDb();
        if (!db) {
            // Fail gracefully: set loading false and leave counts at 0
            setLoading({ users: false, publicTrips: false });
            return;
        }

        // Users: count all docs in users collection.
        const usersCol = collection(db, "users");
        const unsubUsers = onSnapshot(
            usersCol,
            (snap) => {
                if (!mounted.current) return;
                setStats((s) => ({ ...s, users: snap.size }));
                setLoading((l) => ({ ...l, users: false }));
            },
            (err) => {
                console.error("[useStats] users onSnapshot error:", err);
                setStats((s) => ({ ...s, users: 0 }));
                setLoading((l) => ({ ...l, users: false }));
            }
        );

        // Public trips: trips where visibility === 'public'
        const publicTripsQ = query(collection(db, "trips"));
        const unsubPublicTrips = onSnapshot(
            publicTripsQ,
            (snap) => {
                if (!mounted.current) return;
                setStats((s) => ({ ...s, publicTrips: snap.size }));
                setLoading((l) => ({ ...l, publicTrips: false }));
            },
            (err) => {
                console.error("[useStats] public trips onSnapshot error:", err);
                setStats((s) => ({ ...s, publicTrips: 0 }));
                setLoading((l) => ({ ...l, publicTrips: false }));
            }
        );

        return () => {
            mounted.current = false;
            try { unsubUsers(); } catch (e) { /* noop */ }
            try { unsubPublicTrips(); } catch (e) { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once on mount

    return { stats, loading };
}
