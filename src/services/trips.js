// src/services/trips.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/**
 * addTrip(tripData, ownerUid)
 * - tripData: object from TripModal (title, startLocation, etc.)
 * - ownerUid: the authenticated user's uid (App passes currentUser.uid)
 *
 * Returns: docId (string)
 */
export async function addTrip(tripData = {}, ownerUid) {
  if (!ownerUid) {
    throw new Error("addTrip: ownerUid is required (user must be signed in).");
  }

  // Minimal sanitization / normalization
  const doc = {
    title: (tripData.title || "").trim(),
    startLocation: tripData.startLocation || null,
    destination: tripData.destination || null,
    startDate: tripData.startDate || null,
    endDate: tripData.endDate || null,
    notes: (tripData.notes || "").trim(),
    visibility: tripData.visibility || "private", // default private
    owner_id: ownerUid,
    allowedUsers: Array.isArray(tripData.allowedUsers) && tripData.allowedUsers.length
      ? Array.from(new Set([ownerUid, ...tripData.allowedUsers]))
      : [ownerUid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "trips"), doc);
  return ref.id;
}
