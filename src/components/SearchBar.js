// src/SearchBar.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./css/SearchBar.css";

const DEFAULT_TAGS = ["roadtrip", "mountains", "beaches", "food", "photography", "bike"];

function normalize(s = "") {
  return s.toLowerCase().trim();
}

/**
 * SearchBar
 * props:
 *  - users: array of user objects (optional)
 *  - trips: array of trip objects (optional)
 *  - tags: optional array of tags to search (falls back to DEFAULT_TAGS)
 *  - minChars: number (default 3) — minimum chars before autocomplete triggers
 *  - debounceMs: number (default 300)
 */
export default function SearchBar({
  users = [],
  trips = [],
  tags = DEFAULT_TAGS,
  minChars = 3,
  debounceMs = 300,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ users: [], places: [], tags: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // flatten results for keyboard navigation
  const flatResults = useMemo(() => {
    const list = [];
    results.users.forEach((u) =>
      list.push({
        type: "user",
        id: u.id,
        // MAIN CHANGE: show displayName as label, handle as subtitle (prefixed by @)
        label: u.displayName || u.handle || u.email || u.id,
        subtitle: u.handle ? `@${u.handle}` : u.email || "",
        avatar: u.photoURL || u.avatar || null,
        payload: u,
      })
    );
    results.places.forEach((t) =>
      list.push({
        type: "place",
        id: t.id,
        label: t.title || t.destination || t.location || t.id,
        subtitle: t.destination || t.location || t.excerpt || "",
        avatar: t.cover || t.photo || null,
        payload: t,
      })
    );
    results.tags.forEach((tag) =>
      list.push({
        type: "tag",
        id: tag,
        label: `#${tag}`,
        subtitle: `Tag • ${tag}`,
        avatar: null,
        payload: tag,
      })
    );
    return list;
  }, [results]);

  // CLIENT-SIDE DEBOUNCE (fast local filtering)
  useEffect(() => {
    const q = normalize(query);
    if (!q || q.length < minChars) {
      setResults({ users: [], places: [], tags: [] });
      setShowDropdown(false);
      setActiveIndex(-1);
      return;
    }

    const timer = setTimeout(() => {
      const matchedUsers = users
        .filter((u) =>
          [u.handle, u.displayName, u.location, u.email]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        )
        .slice(0, 6);

      const matchedPlaces = trips
        .filter((t) =>
          [t.title, t.destination, t.location, t.excerpt]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        )
        .slice(0, 6);

      const matchedTags = tags.filter((tag) => tag.toLowerCase().includes(q)).slice(0, 8);

      if (matchedUsers.length || matchedPlaces.length || matchedTags.length) {
        setResults({ users: matchedUsers, places: matchedPlaces, tags: matchedTags });
        setShowDropdown(true);
        setActiveIndex(-1);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, users, trips, tags, minChars, debounceMs]);

  // SERVER-SIDE DEBOUNCED FETCH — robust implementation
  useEffect(() => {
    if (!query || query.length < minChars) {
      return;
    }

    const t = setTimeout(async () => {
      try {
        const base = process.env.REACT_APP_API_BASE || "";
        const url = `${base}/api/search?q=${encodeURIComponent(query)}`;

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();

        if (!res.ok) {
          console.warn("[search-client] search API returned status=", res.status, "body=", text.slice(0, 300));
          return;
        }

        if (!text) {
          setResults({ users: [], places: [], tags: [] });
          setShowDropdown(true);
          setActiveIndex(-1);
          return;
        }

        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          console.error("[search-client] invalid JSON from search API:", e, "raw:", text.slice(0, 500));
          return;
        }

        setResults({
          users: json.users || [],
          places: json.trips || [],
          tags: json.tags || [],
        });
        setShowDropdown(true);
        setActiveIndex(-1);
      } catch (err) {
        console.error("[search-client] fetch error:", err);
      }
    }, debounceMs);

    return () => clearTimeout(t);
  }, [query, minChars, debounceMs]);

  // keyboard nav
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex((i) => {
        const next = i + 1;
        return Math.min(next, flatResults.length - 1);
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && flatResults[activeIndex]) {
        e.preventDefault();
        handleSelect(flatResults[activeIndex]);
      } else {
        navigate(`/explore?q=${encodeURIComponent(query)}`);
        setShowDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleSelect = (item) => {
    setShowDropdown(false);
    setActiveIndex(-1);
    if (!item) return;
    if (item.type === "user") navigate(`/Travel/@${(item.payload.handle || item.payload.id)}`);
    else if (item.type === "place") navigate(`/Travel/${encodeURIComponent(item.payload.slug || item.id)}`);
    else if (item.type === "tag") navigate(`/explore?tag=${encodeURIComponent(item.payload)}`);
  };

  // close when clicking outside
  useEffect(() => {
    const onDocClick = (ev) => {
      if (searchRef.current && !searchRef.current.contains(ev.target)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const handleFocus = () => {
    if (
      query &&
      query.length >= minChars &&
      (results.users.length || results.places.length || results.tags.length)
    ) {
      setShowDropdown(true);
    }
  };

  return (
    <div className="hp-search" ref={searchRef}>
      <div className="search-input-wrap">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search people, places, tags..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="search-dropdown-listbox"
        />
        <button
          type="button"
          className="search-clear"
          onClick={() => {
            setQuery("");
            setResults({ users: [], places: [], tags: [] });
            setShowDropdown(false);
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
        >
          ✕
        </button>
      </div>

      {/* Dropdown */}
      <div
        id="search-dropdown-listbox"
        role="listbox"
        className={`search-dropdown ${showDropdown && flatResults.length ? "show" : ""}`}
        aria-hidden={!showDropdown || !flatResults.length}
      >
        {flatResults.length === 0 ? (
          <div className="search-empty">No results — try another search</div>
        ) : (
          flatResults.map((r, idx) => (
            <div
              key={`${r.type}-${r.id}-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={`search-item ${idx === activeIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(ev) => {
                ev.preventDefault();
                handleSelect(r);
              }}
            >
              <div className="item-left">
                {r.avatar ? (
                  <img src={r.avatar} alt="" className="item-avatar" />
                ) : (
                  <div className={`item-avatar placeholder ${r.type}`}>{r.type === "tag" ? "#" : r.type === "user" ? "U" : "L"}</div>
                )}
              </div>

              <div className="item-body">
                {/* MAIN CHANGE: title = displayName, subtitle = @handle */}
                <div className="item-title">{r.label}</div>
                <div className="item-sub">{r.subtitle}</div>
              </div>

              <div className="item-right">
                <span className={`type-badge ${r.type}`}>
                  {r.type === "user" ? "User" : r.type === "place" ? "Location" : "Tag"}
                </span>
              </div>
            </div>
          ))
        )}

        {/* footer */}
        <div className="search-footer">
          <button
            className="see-all-btn"
            onMouseDown={(ev) => {
              ev.preventDefault();
              navigate(`/explore?q=${encodeURIComponent(query)}`);
              setShowDropdown(false);
            }}
          >
            See all results for “{query}”
          </button>
        </div>
      </div>
    </div>
  );
}
