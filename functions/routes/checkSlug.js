const express = require("express");
const {normalizeSlug} = require("../utils/slug");

/**
 * Create and return the /check-slug router.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @return {express.Router} Router with POST /check-slug.
 */
module.exports = function(db) {
  // eslint-disable-next-line new-cap
  const router = express.Router();

  router.post("/check-slug", async (req, res) => {
    try {
      const slugRaw = (req.body.slug || "").toString();
      const slug = normalizeSlug(slugRaw);
      if (!slug) {
        return res.status(400).json({error: "missing-slug"});
      }

      const snap = await db.collection("slugs").doc(slug).get();
      return res.json({available: !snap.exists});
    } catch (err) {
      console.error("check-slug error", err);
      return res.status(500).json({error: "internal"});
    }
  });

  return router;
};
