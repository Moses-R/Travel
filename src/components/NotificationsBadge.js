// components/NotificationsBadge.jsx
import React from 'react';
import useNotifications from '../hooks/useNotifications';

export default function NotificationsBadge() {
  const { unreadCount } = useNotifications({ limitResults: 1 }); // we only need counts
  if (!unreadCount) return null;
  return (
    <div aria-live="polite" title={`${unreadCount} unread notifications`}>
      <span className="notification-badge">{unreadCount}</span>
    </div>
  );
}
