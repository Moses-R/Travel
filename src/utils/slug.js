// src/utils/slug.js
export function normalizeSlug(input = "") {
    return (
        (input || "")
            .toLowerCase()
            .normalize("NFKD")                      // remove accents
            .replace(/[\u0300-\u036f]/g, "")       // remove diacritics
            .replace(/[^a-z0-9\s-_]/g, "")         // remove invalid chars
            .trim()
            .replace(/\s+/g, "-")                  // spaces -> hyphen
            .replace(/-+/g, "-")                   // collapse multiple hyphens
            .replace(/^[-_]+|[-_]+$/g, "")         // trim hyphens
            .slice(0, 60)                          // keep slug reasonable length
    );
}
