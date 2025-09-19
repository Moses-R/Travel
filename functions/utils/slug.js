/**
 * Normalize a string into a URL-friendly slug.
 *
 * @param {string} input Raw input string.
 * @return {string} Normalized slug (lowercase, hyphens).
 */
function normalizeSlug(input) {
  const s = (input || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-_]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 60);

  return s;
}

module.exports = {normalizeSlug};
