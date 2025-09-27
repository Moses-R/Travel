/**
 * routes/search.js
 *
 * Server-side search (two-prefix queries) with console logging
 * for debugging prefixes, counts and errors.
 */

const express = require("express");
console.log("[SEARCH-ROUTER] routes/search.js module loaded");

const MAX_PER_TYPE = 6;
const MIN_QUERY_LEN = 3;

/** Build start/end bounds for Firestore prefix queries. */
function prefixRange(q) {
  return {start: q, end: q + "\uf8ff"};
}

/**
 * Create the search router.
 * @param {FirebaseFirestore.Firestore} db
 * @returns {express.Router}
 */
module.exports = function makeSearch(db) {
  // eslint-disable-next-line new-cap
  const router = express.Router();

  /**
   * Middleware that logs header sizes for debugging 431 errors.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {express.NextFunction} next
   */
  function headerLogger(req, res, next) {
    try {
      const headers = req.headers || {};
      let total = 0;
      const rows = [];
      for (const k of Object.keys(headers)) {
        const v = String(headers[k] || "");
        const len = Buffer.byteLength(k, "utf8") +
          Buffer.byteLength(v, "utf8");
        rows.push({
          key: k,
          len,
          preview: v.length > 200 ? v.slice(0, 200) + "…" : v,
        });
        total += len;
      }
      rows.sort((a, b) => b.len - a.len);
      console.log(
          `\n[HEADER-LOGGER] ${new Date().toISOString()} ${req.method} ${
            req.originalUrl
          } totalBytes=${total}`,
      );
      rows.slice(0, 10).forEach((r) => {
        console.log(
            `  ${r.key.padEnd(20)} ${String(r.len).padStart(6)} bytes` +
          `  preview="${r.preview}"`,
        );
      });
    } catch (e) {
      console.error("[HEADER-LOGGER] failed:", e);
    }
    next();
  }

  router.use(headerLogger);

  /**
   * Run two prefix queries (lower-first and upper-first) on a
   * collection/field and return a Map of results keyed by id.
   *
   * @param {FirebaseFirestore.CollectionReference} col
   * @param {string} field - field name to query/orderBy
   * @param {string} raw - original user query
   * @param {Object} [whereClause] optional { fieldPath, op, value }
   * @returns {Promise<Map<string,Object>>}
   */
  async function twoPrefixQuery(col, field, raw, whereClause) {
    const results = new Map();
    if (!raw || raw.length < MIN_QUERY_LEN) return results;

    const lower = raw.toLowerCase();
    const upper = raw[0].toUpperCase() + raw.slice(1);

    /**
     * Try one prefix (either lowercased or uppercased) and
     * add results into the results Map.
     *
     * @param {string} prefix
     */
    async function tryPrefix(prefix) {
      try {
        const {start, end} = prefixRange(prefix);

        console.log(
            "[search] trying prefix=\"" + prefix + "\" field=\"" + field +
            "\" where=" + JSON.stringify(whereClause || null),
        );

        let qRef;
        if (whereClause) {
          qRef = col
              .where(whereClause.fieldPath, whereClause.op, whereClause.value)
              .orderBy(field)
              .startAt(start)
              .endAt(end)
              .limit(50);
        } else {
          qRef = col.orderBy(field).startAt(start).endAt(end).limit(50);
        }

        const snap = await qRef.get();
        console.log(
            "[search] prefix=\"" + prefix + "\" field=\"" + field +
            "\" -> snap.size=" + snap.size,
        );

        const ids = [];
        snap.forEach((d) => {
          ids.push(d.id);
          if (!results.has(d.id)) results.set(d.id, {id: d.id, ...d.data()});
        });

        if (ids.length) {
          console.log(
              "[search] prefix=\"" + prefix + "\" field=\"" + field +
              "\" ids=" + JSON.stringify(ids),
          );
        }
      } catch (err) {
        console.warn(
            "[search] prefix query failed field=\"" + field +
            "\" prefix=\"" + prefix + "\": " + (err.message || err),
        );
      }
    }

    // Try lower then upper
    await tryPrefix(lower);
    await tryPrefix(upper);

    return results;
  }

  router.get("/api/search", async (req, res) => {
    const startTs = Date.now();
    try {
      const raw = (req.query.q || "").toString().trim();
      console.log(
          "[search] request q=\"" + raw + "\" ip=" +
          (req.ip || req.headers["x-forwarded-for"] || "unknown"),
      );

      if (!raw || raw.length < MIN_QUERY_LEN) {
        console.log("[search] query too short, returning empty result");
        return res.json({users: [], trips: [], tags: []});
      }

      const users = [];
      const trips = [];
      const tags = [];

      // --- USERS ---
      try {
        const usersCol = db.collection("users");

        const handleMatches = await twoPrefixQuery(
            usersCol,
            "handle",
            raw,
        );
        console.log("[search] handleMatches count=" + handleMatches.size);

        for (const u of handleMatches.values()) {
          users.push(u);
          if (users.length >= MAX_PER_TYPE) break;
        }

        if (users.length < MAX_PER_TYPE) {
          const nameMatches = await twoPrefixQuery(
              usersCol,
              "displayName",
              raw,
          );
          console.log("[search] displayNameMatches count=" + nameMatches.size);
          for (const u of nameMatches.values()) {
            if (!users.find((x) => x.id === u.id)) {
              users.push(u);
              if (users.length >= MAX_PER_TYPE) break;
            }
          }
        }
      } catch (err) {
        console.error("[search] users search failed:", err);
      }

      // --- TRIPS (public only) ---
      try {
        const tripsCol = db.collection("trips");

        const titleMatches = await twoPrefixQuery(
            tripsCol,
            "title",
            raw,
            {fieldPath: "visibility", op: "==", value: "public"},
        );
        console.log("[search] titleMatches count=" + titleMatches.size);

        for (const t of titleMatches.values()) {
          trips.push(t);
          if (trips.length >= MAX_PER_TYPE) break;
        }

        if (trips.length < MAX_PER_TYPE) {
          const destMatches = await twoPrefixQuery(
              tripsCol,
              "destination",
              raw,
              {fieldPath: "visibility", op: "==", value: "public"},
          );
          console.log(
              "[search] destinationMatches count=" + destMatches.size,
          );
          for (const t of destMatches.values()) {
            if (!trips.find((x) => x.id === t.id)) {
              trips.push(t);
              if (trips.length >= MAX_PER_TYPE) break;
            }
          }
        }
      } catch (err) {
        console.error("[search] trips search failed:", err);
      }

      // Trim and finalize
      if (users.length > MAX_PER_TYPE) users.length = MAX_PER_TYPE;
      if (trips.length > MAX_PER_TYPE) trips.length = MAX_PER_TYPE;

      const durationMs = Date.now() - startTs;
      console.log(
          "[search] finished q=\"" + raw + "\" users=" + users.length +
          " trips=" + trips.length + " time=" + durationMs + "ms",
      );

      return res.json({users, trips, tags});
    } catch (err) {
      console.error("/api/search error:", err);
      return res
          .status(500)
          .json({error: "search_failed", message: String(err)});
    }
  });

  return router;
};
