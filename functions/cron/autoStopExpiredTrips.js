/**
 * Scheduled Cloud Function that auto-stops trips which are still started
 * after endDate + gracePeriod. Runs every 1 hour when supported.
 *
 * This file is meant to be required and exported from functions/index.js.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const DEFAULT_GRACE_HOURS = Number(process.env.GRACE_HOURS) || 2;

/**
 * Parse endDate (string "YYYY-MM-DD", ISO string, Date or Firestore
 * Timestamp-like) into milliseconds since epoch. Returns null if it
 * cannot be parsed.
 *
 * @param {*} endDateField
 * @returns {number|null}
 */
function parseEndDateToMillis(endDateField) {
  if (!endDateField) return null;

  if (typeof endDateField.toMillis === "function") {
    return endDateField.toMillis();
  }

  if (endDateField instanceof Date) {
    return endDateField.getTime();
  }

  if (typeof endDateField === "string") {
    // If date-only "YYYY-MM-DD", parse as UTC midnight.
    const s = endDateField.length === 10 ?
            `${endDateField}T00:00:00Z` :
            endDateField;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return null;
}

/**
 * The actual handler body (extracted so we can register it conditionally).
 * Returns an async function compatible with functions.pubsub.onRun.
 *
 * @returns {Function}
 */
function createHandler() {
  return async () => {
    const nowMs = Date.now();

    const snap = await db
        .collection("trips")
        .where("started", "==", true)
        .limit(500)
        .get();

    if (snap.empty) return null;

    const batch = db.batch();
    const ops = [];

    snap.forEach((doc) => {
      const data = doc.data();

      const endMs = parseEndDateToMillis(data.endDate);
      if (!endMs) return;

      const graceHours = typeof data.gracePeriodHours === "number" ?
                data.gracePeriodHours :
                DEFAULT_GRACE_HOURS;

      const deadlineMs = endMs + graceHours * 60 * 60 * 1000;
      if (nowMs < deadlineMs) return;

      const stoppedAt = admin.firestore.Timestamp.fromMillis(nowMs);

      batch.update(doc.ref, {
        started: false,
        status: "auto-stopped",
        stoppedAt,
        stoppedBy: "system",
        autoStopped: true,
        autoStopReason: "grace_period_expired",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      ops.push((async () => {
        try {
          await db.collection("notifications").add({
            userId: data.owner_id || null,
            tripId: doc.id,
            title: "Trip tracking stopped",
            body:
                            "We stopped tracking \"" +
                            (data.title || doc.id) +
                            "\" — the end date + " +
                            graceHours +
                            "h grace period expired.",
            createdAt: admin.firestore.Timestamp.now(),
            read: false,
            type: "trip_auto_stop",
            action: "extend_or_restart",
          });
        } catch (e) {
          console.error("notify error", e);
        }

        try {
          await db.collection("tripAudits").add({
            tripId: doc.id,
            action: "autoStopped",
            reason: "grace_period_expired",
            at: admin.firestore.Timestamp.now(),
            by: "system",
            metadata: {endDate: data.endDate, graceHours},
          });
        } catch (e) {
          console.error("audit error", e);
        }

        try {
          if (data.trackingSessionId) {
            await db
                .collection("sessions")
                .doc(data.trackingSessionId)
                .update({
                  active: false,
                  endedAt: admin.firestore.Timestamp.now(),
                });
          }
        } catch (e) {
          console.error("session cleanup failed", e);
        }
      })());
    });

    await batch.commit();
    await Promise.all(ops);

    return null;
  };
}

/* ------------------------------------------------------------------ */
/* Guarded registration: register the scheduled function only if the
   current firebase-functions SDK exposes pubsub.schedule. Otherwise
   export a no-op stub so module load / analysis won't crash.         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Guarded registration: do not crash deploy-time analysis if the SDK
   in the deploy environment lacks pubsub.schedule.                   */
/* ------------------------------------------------------------------ */

try {
  if (functions && functions.pubsub &&
      typeof functions.pubsub.schedule === "function") {
    exports.autoStopExpiredTrips = functions.pubsub
        .schedule("every 1 hours")
        .onRun(createHandler());
  } else {
    /* eslint-disable no-console */
    console.warn(
        "firebase-functions SDK missing pubsub.schedule — " +
        "autoStopExpiredTrips not registered. Upgrade SDK to enable it.",
    );
    /* eslint-enable no-console */
    exports.autoStopExpiredTrips = () => null;
  }
} catch (err) {
  // If anything unexpected happens when reading functions.pubsub, avoid
  // throwing at module load time so deploy analysis can proceed.
  /* eslint-disable no-console */
  console.warn(
      "Error checking functions.pubsub.schedule during module load:",
      err,
  );
  /* eslint-enable no-console */
  exports.autoStopExpiredTrips = () => null;
}
