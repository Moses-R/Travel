const admin = require("firebase-admin");

/**
 * Verify a Firebase ID token from the `Authorization` header.
 *
 * Expected format: `Authorization: Bearer <idToken>`.
 * If valid: attaches decoded token to `req.user` and calls `next()`.
 * If invalid or missing: responds with 401 Unauthorized.
 *
 * @param {import("express").Request} req - Express request object
 * @param {import("express").Response} res - Express response object
 * @param {import("express").NextFunction} next - Express next callback
 * @returns {Promise<void>} - Resolves when the middleware completes
 */
async function verifyAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    return res.status(401).json({error: "missing-auth"});
  }

  const idToken = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("verifyAuth failed", err);
    return res.status(401).json({error: "invalid-token"});
  }
}

module.exports = {verifyAuth};
