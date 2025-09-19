// src/utils/handle.js
import { getFirestore, doc, getDoc } from "firebase/firestore";

/**
 * Normalize a user-entered handle:
 * - Unicode NFKC, lowercase
 * - remove disallowed chars (keep a-z0-9, dot, hyphen, underscore)
 * - collapse spaces -> hyphen
 * - remove all leading @ characters
 * - trim leading/trailing hyphens
 * - max length 64
 *
 * Returns:
 *  - normalized handle string on success (e.g. "mary-jane")
 *  - null for invalid / empty input
 */
export function normalizeHandle(input) {
  // console.log("[normalizeHandle] raw input:", input);

  if (input === undefined || input === null) {
    console.warn("[normalizeHandle] input is null/undefined");
    return null;
  }

  try {
    let s = String(input).normalize("NFKC").toLowerCase();
    // console.log("[normalizeHandle] after normalize+lowercase:", s);

    s = s.replace(/^@+/, "").trim();
    // console.log("[normalizeHandle] after strip leading @ + trim:", s);

    if (!s) {
      console.warn("[normalizeHandle] empty after strip/trim");
      return null;
    }

    s = s.replace(/[^a-z0-9\s._-]/g, "");
    // console.log("[normalizeHandle] after remove disallowed:", s);

    s = s.replace(/\s+/g, "-");
    // console.log("[normalizeHandle] after collapse spaces:", s);

    s = s.replace(/[-]{2,}/g, "-").replace(/[.]{2,}/g, ".").replace(/[_]{2,}/g, "_");
    // console.log("[normalizeHandle] after collapse repeats:", s);

    s = s.replace(/^[\-._]+|[\-._]+$/g, "");
    // console.log("[normalizeHandle] after trim leading/trailing symbols:", s);

    s = s.slice(0, 64);
    // console.log("[normalizeHandle] after enforce max length:", s);

    const match = s.match(/^[a-z0-9][a-z0-9._-]*$/);
    if (!match) {
      console.warn("[normalizeHandle] invalid final format:", s);
      return null;
    }

    // console.log("[normalizeHandle] final normalized:", s);
    return s;
  } catch (e) {
    console.error("[normalizeHandle] error:", e);
    return null;
  }
}

/**
 * Return an "@-prefixed" handle (e.g. "@alice"), or empty string if input invalid.
 */
export function ensureAt(raw) {
  // console.log("[ensureAt] input:", raw);
  const n = normalizeHandle(raw);
  const result = n ? `@${n}` : "";
  // console.log("[ensureAt] result:", result);
  return result;
}

/**
 * Check availability of handle by reading handles/{handle} doc.
 * Input may include leading '@' — will be normalized.
 *
 * Returns:
 *  - true  => handle NOT taken (available)
 *  - false => handle taken or invalid or error
 */
export async function isHandleAvailable(rawHandle) {
  // console.log("[isHandleAvailable] raw input:", rawHandle);
  try {
    const handle = normalizeHandle(rawHandle);
    if (!handle) {
      console.warn("[isHandleAvailable] invalid handle after normalize:", rawHandle);
      return false;
    }

    // console.log("[isHandleAvailable] checking Firestore for handle:", handle);
    const db = getFirestore();
    const docRef = doc(db, "handles", handle);
    const snap = await getDoc(docRef);

    const available = !snap.exists();
    // console.log(`[isHandleAvailable] ${handle} available?`, available);
    return available;
  } catch (err) {
    console.error("[isHandleAvailable] error checking handle:", err);
    return false;
  }
}

/**
 * Optional debounce helper (small, zero-deps).
 */
export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    // console.log("[debounce] called with args:", args);
    if (timer) {
      clearTimeout(timer);
      // console.log("[debounce] cleared previous timer");
    }
    timer = setTimeout(() => {
      timer = null;
      try {
        // console.log("[debounce] invoking function with args:", args);
        fn(...args);
      } catch (e) {
        console.error("[debounce] handler error:", e);
      }
    }, wait);
    // console.log("[debounce] scheduled execution in", wait, "ms");
  };
}
