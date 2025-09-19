// src/api/createTripCallable.js
export default function createTripCallableFactory(opts = {}) {
  const {
    auth = null,
    apiBase = "",
    timeout = 10000,
  } = opts;

  if (!apiBase) {
    throw new Error("createTripCallableFactory requires apiBase option");
  }

  const fetchWithTimeout = async (url, init = {}, ms = timeout) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  return {
    async checkSlugAvailability(slug) {
      if (!slug || typeof slug !== "string") return { available: false };
      const url = `${apiBase}/check-slug`;
      try {
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!res.ok) {
          console.warn("checkSlugAvailability non-ok", res.status);
          return { available: null };
        }
        const json = await res.json();
        return { available: Boolean(json?.available) };
      } catch (err) {
        console.warn("checkSlugAvailability error", err);
        return { available: null };
      }
    },

    async createTrip({ slug, tripData }) {
      if (!slug || !tripData) throw new Error("slug and tripData required");
      if (!auth) throw new Error("Auth instance required for createTrip");
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      const idToken = await user.getIdToken();
      const url = `${apiBase}/create-trip`;
      try {
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ slug, tripData }),
        });

        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          throw new Error(`Invalid JSON from server: ${text}`);
        }

        if (!res.ok) {
          if (res.status === 409 || (json && json.error === "already-exists")) {
            const err = new Error("Slug already taken");
            err.code = "already-exists";
            throw err;
          }
          const message = json?.message || json?.error || `HTTP ${res.status}`;
          throw new Error(message);
        }

        return json;
      } catch (err) {
        console.error("createTrip error", err);
        throw err;
      }
    },
  };
}
