// src/pages/Home.jsx
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthModal from "../components/AuthModal";
import "./css/Home.css";

function Skeleton({ height = 44 }) {
  return <div className="skel" style={{ height, borderRadius: 8 }} aria-hidden="true" />;
}

function TripCard({ trip }) {
  return (
    <Link to={`/trips/${trip.id}`} className="trip-card" aria-label={`Open trip ${trip.title}`}>
      <div
        className="trip-media"
        style={{ backgroundImage: `url(${trip.cover || trip.photo || "/trip-placeholder.jpg"})` }}
      >
        <div className="trip-overlay">{trip.title}</div>
      </div>
      <div className="trip-meta">
        <div>
          <div className="trip-location">{trip.location}</div>
          <div className="trip-author">{trip.authorName || "—"}</div>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
          {trip.excerpt || ""}
        </div>
      </div>
    </Link>
  );
}

function UserCard({ user }) {
  return (
    <div className="creator-card">
      <img src={user.avatar || "/default-avatar.png"} alt="" className="creator-avatar" />
      <div className="creator-meta">
        <div className="creator-name">{user.name}</div>
        <div className="creator-sub">{user.location || user.headline}</div>
      </div>
    </div>
  );
}

/* --- Toast: top-center --- */
function Toast({ message, onClose, duration = 3500 }) {
  React.useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        top: 20,
        background: "rgba(17,24,39,0.95)",
        color: "white",
        padding: "10px 14px",
        borderRadius: 8,
        boxShadow: "0 6px 18px rgba(2,6,23,0.3)",
        zIndex: 9999,
        maxWidth: 640,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

export default function HomePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // start with empty arrays — no prefilled/demo data
  const [users, setUsers] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [query, setQuery] = useState("");

  // No remote fetch for now — UI will display "no data" states.
  const [loading] = useState(false);

  // UI state
  const [toastMsg, setToastMsg] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.location || "").toLowerCase().includes(q)
    );
  }, [users, query]);

  // TODO: Later replace this with Firestore queries (fetch users/featured from Firebase)
  // Example: useEffect(() => { loadFromFirestore(); }, []);

  // --- Handlers for auth / CTA behavior ---
  const handleAddTripClick = (e) => {
    if (currentUser) {
      navigate("/trips/new");
      return;
    }
    setToastMsg("Please log in or sign up to add a trip.");
  };

  const handleCreateProfileClick = () => {
    setAuthOpen(true);
  };

  return (
    <div className="hp-container">
      <header className="hp-hero">
        <div className="hp-brand">
          <div className="hp-logo">Jift</div>
          <h1 className="hp-title">Travelogue — explore real trips</h1>
          <p className="hp-sub">
            Discover curated trips, follow creators, and share your own
            adventures. Beautiful maps, galleries and travel stories — ready to
            inspire your next journey.
          </p>
          <div style={{ marginTop: 12 }}>
            <button className="hp-btn primary" style={{ marginRight: 8 }} onClick={handleAddTripClick}>
              + Add trip
            </button>

            {!currentUser && (
              <button className="hp-btn ghost" onClick={handleCreateProfileClick}>
                Create profile
              </button>
            )}

            <Link to="/explore" className="hp-btn link" style={{ marginLeft: 8 }}>
              Explore
            </Link>
          </div>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <div className="hp-search">
            <input
              placeholder="Search people, places, tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <section className="hp-grid">
        <div>
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h2 style={{ margin: 0 }}>Featured trips</h2>
              <Link to="/explore">See all</Link>
            </div>

            <div className="featured-grid" style={{ marginTop: 10 }}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={160} />)
              ) : featured.length === 0 ? (
                <div style={{ padding: 12, color: "#6b7280" }}>No featured trips yet.</div>
              ) : (
                featured.map((t) => <TripCard trip={t} key={t.id} />)
              )}
            </div>
          </div>

          <div style={{ marginTop: 16 }} className="card">
            <h3>Trending tags</h3>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {["#roadtrip", "#mountains", "#beaches", "#food", "#photography", "#bike"].map((tag) => (
                <Link
                  key={tag}
                  to={`/explore?tag=${encodeURIComponent(tag.replace("#", ""))}`}
                  className="tag"
                  aria-label={`Explore ${tag}`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }} className="card">
            <h3>Editor picks</h3>
            <div className="editor-grid" style={{ marginTop: 10 }}>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ padding: 12 }}>
                    <Skeleton height={70} />
                    <Skeleton height={18} />
                    <Skeleton height={14} />
                  </div>
                ))
              ) : featured.length === 0 ? (
                <div style={{ color: "#6b7280", padding: 12 }}>No editor picks available.</div>
              ) : (
                featured.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    style={{
                      borderRadius: 10,
                      overflow: "hidden",
                      border: "1px solid #f0f3f7",
                      padding: 12,
                    }}
                  >
                    <div style={{ height: 70, backgroundImage: `url(${t.cover || "/trip-placeholder.jpg"})`, backgroundSize: "cover", borderRadius: 8 }} />
                    <h4 style={{ marginTop: 8 }}>{t.title}</h4>
                    <p style={{ color: "#6b7280", fontSize: 13 }}>
                      {t.excerpt || ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="right-column">
          <div className="card small">
            <h4 style={{ marginTop: 0 }}>Quick stats</h4>
            <div className="stats-grid" style={{ marginTop: 8 }}>
              <div>
                <div className="stat-num">{featured.length > 0 ? featured.length : "—"}</div>
                <div className="stat-label">Featured trips</div>
              </div>
              <div>
                <div className="stat-num">{users.length > 0 ? users.length : "—"}</div>
                <div className="stat-label">Creators</div>
              </div>
              <div>
                <div className="stat-num">—</div>
                <div className="stat-label">Shares</div>
              </div>
            </div>
          </div>

          <div className="card small">
            <h4 style={{ marginTop: 0 }}>Suggested creators</h4>
            <div style={{ marginTop: 8 }}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={52} />)
                : users.slice(0, 6).map((u) => <UserCard user={u} key={u.id} />)}
              {!loading && users.length === 0 && <div style={{ color: "#6b7280", paddingTop: 8 }}>No creators yet.</div>}
            </div>
          </div>

          <div className="card small">
            <h4 style={{ marginTop: 0 }}>New members</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <li key={i}>
                      <Skeleton height={44} />
                    </li>
                  ))
                : users.slice(0, 5).map((u) => (
                    <li
                      key={u.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 0",
                      }}
                    >
                      <img
                        src={u.avatar || "/default-avatar.png"}
                        alt=""
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          objectFit: "cover",
                        }}
                      />
                      <div>
                        <Link to={`/users/${u.id}`} style={{ fontWeight: 600 }}>
                          {u.name}
                        </Link>
                        <div style={{ color: "#6b7280", fontSize: 13 }}>{u.location}</div>
                      </div>
                    </li>
                  ))}
            </ul>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <Link to="/users" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Browse all creators
              </Link>
            </div>
          </div>

          <div className="card small">
            <h4 style={{ marginTop: 0 }}>Why Jift?</h4>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              A simple, social place for travelers to store memories, discover
              routes, and find like-minded creators.
            </p>
            <ul style={{ marginTop: 8, paddingLeft: 18, color: "#6b7280", fontSize: 13 }}>
              <li>Maps & live tracking</li>
              <li>Rich galleries & stories</li>
              <li>Creator-first features</li>
            </ul>
          </div>
        </aside>
      </section>

      <footer className="hp-footer">
        © {new Date().getFullYear()} Jift · Built with ❤️ — privacy-first · creator-friendly
      </footer>

      {/* Auth modal */}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      {/* Toast */}
      <Toast message={toastMsg} onClose={() => setToastMsg("")} />
    </div>
  );
}
