// components/NotificationList.jsx
import React, { useState } from 'react';
import useNotifications from '../hooks/useNotifications';
import { markNotificationRead, markMultipleRead } from '../libs/notificationsClient';
import { doc, getFirestore } from 'firebase/firestore';

function formatDate(ts) {
  if (!ts) return '';
  // ts may be a Firestore Timestamp
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  // or it could be ISO string
  return new Date(ts).toLocaleString();
}

export default function NotificationList({ limitResults = 100 }) {
  const { notifications, loading, unreadCount } = useNotifications({ limitResults });
  const [busy, setBusy] = useState(false);
  const db = getFirestore();

  async function handleMarkRead(n) {
    // optimistic UI: locally set read to true
    const original = n.read;
    n.read = true;
    setBusy(true);
    try {
      await markNotificationRead(n.id);
    } catch (err) {
      console.error('mark read failed', err);
      n.read = original; // revert
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkAllRead() {
    const ids = notifications.filter((x) => !x.read).map((x) => x.id);
    if (!ids.length) return;
    setBusy(true);
    try {
      // prefer calling server-side batch callable if available
      if (typeof markMultipleRead === 'function') {
        await markMultipleRead(ids);
      } else {
        // fallback: call single callable repeatedly (less efficient)
        await Promise.all(ids.map((id) => markNotificationRead(id)));
      }
    } catch (err) {
      console.error('mark all read failed', err);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div>Loading notifications…</div>;
  if (!notifications.length) return <div className="muted">No notifications.</div>;

  return (
    <div className="notifications-panel">
      <div className="notifications-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>Notifications</strong>
        <div>
          <span style={{ marginRight: 8 }}>{unreadCount} unread</span>
          <button onClick={handleMarkAllRead} disabled={busy || unreadCount === 0}>
            Mark all read
          </button>
        </div>
      </div>

      <ul className="notifications-list" aria-live="polite" style={{ listStyle: 'none', padding: 0 }}>
        {notifications.map((n) => (
          <li key={n.id} className={`notification ${n.read ? 'read' : 'unread'}`} style={{ padding: 10, borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: n.read ? 'normal' : '600' }}>{n.title || 'Notification'}</div>
                <div style={{ color: '#444' }}>{n.text}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{formatDate(n.createdAt)}</div>
              </div>

              <div style={{ marginLeft: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!n.read && <button onClick={() => handleMarkRead(n)} disabled={busy}>Mark read</button>}
                {n.url && (
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
