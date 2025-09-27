// libs/notificationsClient.js
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

export async function markNotificationRead(notificationId) {
  const fn = httpsCallable(functions, 'markNotificationRead');
  const res = await fn({ notificationId });
  return res.data;
}

// Optional: mark multiple read (if you created a callable)
export async function markMultipleRead(notificationIds = []) {
  const fn = httpsCallable(functions, 'markMultipleRead');
  const res = await fn({ notificationIds });
  return res.data;
}
