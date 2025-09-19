const express = require("express");
const {verifyAuth} = require("../middleware/verifyAuth");
const {normalizeSlug} = require("../utils/slug");
const admin = require("firebase-admin");

/**
 * Create and return the /create-trip router.
 *
 * POST body: { slug: "...", tripData: { ... } }
 * Requires Authorization: Bearer <idToken>
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @return {express.Router} Router with POST /create-trip.
 */
module.exports = function(db) {
  // eslint-disable-next-line new-cap
  const router = express.Router();

  router.post("/create-trip", verifyAuth, async (req, res) => {
    try {
      const slugRaw = (req.body.slug || "").toString();
      const slug = normalizeSlug(slugRaw);
      if (!slug) {
        return res.status(400).json({error: "missing-slug"});
      }

      const tripData = req.body.tripData || {};
      const ownerId = req.user.uid;

      const slugRef = db.collection("slugs").doc(slug);
      const tripRef = db.collection("trips").doc();

      const result = await db.runTransaction(async (tx) => {
        const s = await tx.get(slugRef);
        if (s.exists) {
          const err = new Error("slug-taken");
          err.code = "already-exists";
          throw err;
        }

        const payload = {
          ...tripData,
          owner_id: ownerId,
          allowedUsers:
            Array.isArray(tripData.allowedUsers) &&
            tripData.allowedUsers.length ?
              tripData.allowedUsers :
              [ownerId],
          visibility: tripData.visibility || "private",
          slug,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        tx.set(tripRef, payload);
        tx.set(slugRef, {
          tripId: tripRef.id,
          ownerId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {id: tripRef.id, slug};
      });

      return res.json(result);
    } catch (err) {
      console.error("create-trip error", err);
      if (err.code === "already-exists") {
        return res
            .status(409)
            .json({error: "already-exists", message: "Slug already taken"});
      }
      return res.status(500).json({error: err.message || "internal"});
    }
  });

  return router;
};
