// utils/loadTripBySlug.js
import { getFirestore, doc, getDoc } from "firebase/firestore";

const db = getFirestore();

/**
 * Resolve a slug to a trip document using the slugs mapping collection.
 * @param {string} slug - exact slug doc id to look up (case-sensitive)
 * @returns {Promise<object>} trip data
 * @throws {Error} with helpful message for UI/logging
 */
export async function loadTripBySlug(slug) {
    if (!slug || typeof slug !== "string") {
        throw new Error("Invalid slug");
    }

    // slug document id must match exactly the slug string
    const slugRef = doc(db, "slugs", slug);
    const slugSnap = await getDoc(slugRef);
    if (!slugSnap.exists()) {
        throw new Error("Slug not found");
    }
    const slugData = slugSnap.data();
    const tripId = slugData.tripId;
    if (!tripId) {
        throw new Error("Slug mapping invalid (no tripId)");
    }

    const tripRef = doc(db, "trips", tripId);
    const tripSnap = await getDoc(tripRef);
    if (!tripSnap.exists()) {
        // This will surface as permission-denied if the doc exists but rules block it,
        // or 'not found' if doc doesn't exist.
        throw new Error("Trip not found or access denied");
    }
    return { id: tripSnap.id, ...tripSnap.data() };
}
