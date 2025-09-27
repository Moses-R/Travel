// hooks/useNotifications.js
import { useEffect, useState, useMemo } from 'react';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function useNotifications({ limitResults = 100 } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();
  const db = getFirestore();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Query notifications addressed to the current user
    const q = query(
      collection(db, 'notifications'),
      where('to', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(limitResults)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data
          };
        });
        setNotifications(docs);
        setLoading(false);
      },
      (err) => {
        console.error('notifications listener error', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [auth, db, limitResults]);

  // memoized counts
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return { notifications, loading, unreadCount };
}
