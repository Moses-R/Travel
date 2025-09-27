// functions/notifications/markNotificationRead.js
const functions = require("firebase-functions");
const admin = require("firebase-admin"); // do NOT call initializeApp()
const db = admin.firestore();

exports.markNotificationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in",
    );
  }

  const uid = context.auth.uid;
  const notificationId = data.notificationId;

  if (!notificationId || typeof notificationId !== "string") {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "notificationId required",
    );
  }

  const ref = db.collection("notifications").doc(notificationId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Notification not found");
  }

  const nd = snap.data();
  if (nd.to !== uid) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "Not the notification recipient",
    );
  }

  if (nd.read === true) {
    return {success: true, alreadyRead: true};
  }

  try {
    await ref.update({read: true});
    return {success: true};
  } catch (err) {
    console.error("failed to mark read", err);
    throw new functions.https.HttpsError("internal", "Failed to mark read");
  }
});
