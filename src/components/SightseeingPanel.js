// src/components/SightseeingPanel.jsx
import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";

function loadGoogleMapsScript(key) {
    if (!key) return Promise.reject(new Error("Google Maps API key missing"));
    if (window.google && window.google.maps) return Promise.resolve(window.google);
    const id = "google-maps-js";
    if (document.getElementById(id)) {
        return new Promise((res) => {
            const check = setInterval(() => { if (window.google && window.google.maps) { clearInterval(check); res(window.google); } }, 100);
        });
    }
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.id = id;
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
        s.async = true;
        s.defer = true;
        s.onerror = (e) => reject(new Error("Failed to load Google Maps script"));
        s.onload = () => {
            if (window.google && window.google.maps) resolve(window.google);
            else reject(new Error("Google Maps script loaded but google.maps not available"));
        };
        document.head.appendChild(s);
    });
}

export default function SightseeingPanel({ db, selectedTrip, user, setToast, savedSights = [] }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]); // {description, place_id}
    const [center, setCenter] = useState(null); // {name, lat, lng}
    const [pois, setPois] = useState([]);
    const [loading, setLoading] = useState(false);
    const [existing, setExisting] = useState(new Set());
    const googleRef = useRef(null);
    const serviceRefs = useRef({ autocompleteSvc: null, placesSvc: null, geocoder: null });
    const dummyMapRef = useRef(null);

    // determine owner status (accept either ownerId or owner_id)
    const isOwner = Boolean(
        selectedTrip && user && (selectedTrip.ownerId === user.uid || selectedTrip.owner_id === user.uid)
    );

    // load Google script and services
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const g = await loadGoogleMapsScript(GOOGLE_KEY);
                if (cancelled) return;
                googleRef.current = g;
                if (!dummyMapRef.current) {
                    const d = document.createElement("div");
                    d.style.display = "none";
                    document.body.appendChild(d);
                    dummyMapRef.current = d;
                }
                serviceRefs.current.autocompleteSvc = new g.maps.places.AutocompleteService();
                serviceRefs.current.geocoder = new g.maps.Geocoder();
                serviceRefs.current.placesSvc = new g.maps.places.PlacesService(dummyMapRef.current);
            } catch (err) {
                console.error("Google Maps load failed:", err);
                if (setToast) setToast({ msg: "Failed to load Google Maps API", type: "warning" });
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // load existing sights for dedupe
    // derive existing set from parent-provided savedSights (no extra Firestore reads)
    useEffect(() => {
        try {
            if (!Array.isArray(savedSights) || savedSights.length === 0) {
                setExisting(new Set());
                return;
            }
            const s = new Set(savedSights.map(ss => `${ss.provider}:${ss.placeId}`));
            setExisting(s);
        } catch (err) {
            console.warn("compute existing sights from savedSights failed", err);
            setExisting(new Set());
        }
    }, [savedSights]);


    // Autocomplete suggestions (no longer restricted to cities)
    useEffect(() => {
        if (!serviceRefs.current.autocompleteSvc || !query || query.length < 2) {
            setSuggestions([]);
            return;
        }

        let active = true;
        const options = { input: query };

        if (center && googleRef.current) {
            const g = googleRef.current.maps;
            options.locationBias = g.LatLngBounds ? new g.LatLngBounds(
                new g.LatLng(center.lat - 0.08, center.lng - 0.08),
                new g.LatLng(center.lat + 0.08, center.lng + 0.08)
            ) : undefined;
        } else if (selectedTrip && selectedTrip.last_position) {
            const lp = selectedTrip.last_position;
            options.locationBias = new googleRef.current.maps.LatLng(lp.lat, lp.lng);
        }

        serviceRefs.current.autocompleteSvc.getPlacePredictions(options, (preds, status) => {
            if (!active) return;
            const OK = googleRef.current && googleRef.current.maps && googleRef.current.maps.places.PlacesServiceStatus.OK;
            if (status !== OK) {
                setSuggestions([]);
                return;
            }
            setSuggestions((preds || []).map(p => ({ description: p.description, place_id: p.place_id })));
        });

        return () => (active = false);
    }, [query, center, selectedTrip]);

    // call existing nearbySearch but append results to current pois and avoid duplicates
    async function fetchNearbyAndAppend(lat, lng, avoidSet = new Set()) {
        if (!serviceRefs.current.placesSvc) {
            return;
        }
        setLoading(true);
        try {
            const request = {
                location: new (googleRef.current.maps).LatLng(lat, lng),
                radius: 30000,
            };
            serviceRefs.current.placesSvc.nearbySearch(request, (results, status) => {
                setLoading(false);
                const OK = googleRef.current && googleRef.current.maps && googleRef.current.maps.places.PlacesServiceStatus.OK;
                if (status !== OK || !results) {
                    return;
                }
                const mapped = results
                    .map((p) => {
                        const photoUrl = (p.photos && p.photos[0] && typeof p.photos[0].getUrl === "function") ? p.photos[0].getUrl({ maxWidth: 400 }) : "";
                        return {
                            place_id: p.place_id,
                            name: p.name,
                            category: (p.types && p.types[0]) || "",
                            location: { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() },
                            address: p.vicinity || p.formatted_address || "",
                            photoUrl,
                            raw: p,
                        };
                    })
                    .filter((x) => x.place_id && !avoidSet.has(x.place_id));
                setPois((prev) => {
                    const seen = new Set((prev || []).map((p) => p.place_id));
                    const filtered = mapped.filter((m) => !seen.has(m.place_id));
                    return [...(prev || []), ...filtered];
                });
            });
        } catch (err) {
            setLoading(false);
            console.error("fetchNearbyAndAppend error", err);
        }
    }

    function getPlaceDetails(placeId, fields = ['place_id', 'name', 'geometry', 'formatted_address', 'photos', 'types', 'vicinity']) {
        return new Promise((resolve, reject) => {
            try {
                if (!serviceRefs.current.placesSvc) return reject(new Error('Places service not ready'));
                serviceRefs.current.placesSvc.getDetails({ placeId, fields }, (place, status) => {
                    const OK = googleRef.current && googleRef.current.maps && googleRef.current.maps.places.PlacesServiceStatus.OK;
                    if (status === OK && place) resolve(place);
                    else reject(new Error('getDetails failed or no place'));
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    const pickSuggestion = async (sug) => {
        try {
            if (!serviceRefs.current.geocoder) return;
            serviceRefs.current.geocoder.geocode({ placeId: sug.place_id }, async (results, status) => {
                const OK = googleRef.current && googleRef.current.maps && googleRef.current.maps.GeocoderStatus.OK;
                if (status !== OK || !results || results.length === 0) {
                    if (setToast) setToast({ msg: "Failed to resolve place", type: "warning" });
                    return;
                }
                const loc = results[0].geometry.location;
                const lat = loc.lat(), lng = loc.lng();
                setCenter({ name: results[0].formatted_address || sug.description, lat, lng });
                setQuery(sug.description);
                setSuggestions([]);

                try {
                    const details = await getPlaceDetails(sug.place_id);
                    const primaryPoi = {
                        place_id: details.place_id || sug.place_id,
                        name: details.name || sug.description,
                        category: (details.types && details.types[0]) || "",
                        location: { lat: details.geometry.location.lat(), lng: details.geometry.location.lng() },
                        address: details.formatted_address || (results[0] && results[0].formatted_address) || "",
                        photoUrl: (details.photos && details.photos[0] && typeof details.photos[0].getUrl === "function") ? details.photos[0].getUrl({ maxWidth: 400 }) : "",
                        raw: details,
                    };
                    setPois([primaryPoi]);
                    await fetchNearbyAndAppend(lat, lng, new Set([primaryPoi.place_id]));
                } catch (err) {
                    const fallbackPoi = {
                        place_id: sug.place_id,
                        name: sug.description,
                        category: "",
                        location: { lat, lng },
                        address: results[0].formatted_address || "",
                        photoUrl: "",
                        raw: results[0],
                    };
                    setPois([fallbackPoi]);
                    await fetchNearbyAndAppend(lat, lng, new Set([fallbackPoi.place_id]));
                }
            });
        } catch (err) {
            console.error("pickSuggestion error", err);
            if (setToast) setToast({ msg: "Error selecting place", type: "warning" });
        }
    };

    const searchPlaceByText = (text) => {
        if (!serviceRefs.current.placesSvc) {
            if (setToast) setToast({ msg: "Places service not ready", type: "warning" });
            return;
        }
        setLoading(true);
        setPois([]);
        const fields = ["place_id", "name", "geometry", "formatted_address", "photos", "types", "vicinity"];
        const req = { query: text, fields: fields };

        serviceRefs.current.placesSvc.findPlaceFromQuery(req, async (places, status) => {
            setLoading(false);
            const OK = googleRef.current && googleRef.current.maps && googleRef.current.maps.places.PlacesServiceStatus.OK;
            if (status !== OK || !places || places.length === 0) {
                if (setToast) setToast({ msg: "No place found for that name", type: "info" });
                return;
            }

            const p = places[0];
            const lat = (p.geometry && p.geometry.location && typeof p.geometry.location.lat === 'function') ? p.geometry.location.lat() : (p.geometry && p.geometry.location?.lat) || null;
            const lng = (p.geometry && p.geometry.location && typeof p.geometry.location.lng === 'function') ? p.geometry.location.lng() : (p.geometry && p.geometry.location?.lng) || null;
            setCenter({ name: p.formatted_address || p.name, lat, lng });

            const primaryPoi = {
                place_id: p.place_id,
                name: p.name,
                category: (p.types && p.types[0]) || "",
                location: { lat, lng },
                address: p.formatted_address || p.vicinity || "",
                photoUrl: (p.photos && p.photos[0] && typeof p.photos[0].getUrl === "function") ? p.photos[0].getUrl({ maxWidth: 400 }) : "",
                raw: p,
            };

            setPois([primaryPoi]);
            await fetchNearbyAndAppend(lat, lng, new Set([primaryPoi.place_id]));
        });
    };

    const useCurrent = () => {
        if (!navigator.geolocation) { if (setToast) setToast({ msg: "Geolocation unsupported", type: "warning" }); return; }
        if (setToast) setToast({ msg: "Reading location…", type: "info" });
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            if (serviceRefs.current.geocoder) {
                serviceRefs.current.geocoder.geocode({ location: { lat, lng } }, (res, status) => {
                    const name = (status === (googleRef.current && googleRef.current.maps.GeocoderStatus.OK) && res && res[0]) ? res[0].formatted_address : "Current location";
                    setCenter({ name, lat, lng });
                });
            } else {
                setCenter({ name: "Current location", lat, lng });
            }
            setQuery("Current location");
            fetchNearby(lat, lng);
        }, (err) => {
            console.error("geo error", err);
            if (setToast) setToast({ msg: "Location permission denied or unavailable", type: "warning" });
        }, { enableHighAccuracy: true, timeout: 15000 });
    };

    function fetchNearby(lat, lng) {
        if (!serviceRefs.current.placesSvc) {
            if (setToast) setToast({ msg: "Places service not ready", type: "warning" });
            return;
        }
        setLoading(true);
        setPois([]);
        const request = {
            location: new (googleRef.current.maps).LatLng(lat, lng),
            radius: 30000,
        };
        serviceRefs.current.placesSvc.nearbySearch(request, (results, status, pagination) => {
            setLoading(false);
            const OK = googleRef.current && googleRef.current.maps && googleRef.current.maps.places.PlacesServiceStatus.OK;
            if (status !== OK || !results) {
                if (setToast) setToast({ msg: "No places found nearby", type: "info" });
                return;
            }
            const mapped = results.map((p) => {
                const photoUrl = (p.photos && p.photos[0] && typeof p.photos[0].getUrl === "function") ? p.photos[0].getUrl({ maxWidth: 400 }) : "";
                return {
                    place_id: p.place_id,
                    name: p.name,
                    category: (p.types && p.types[0]) || "",
                    location: { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() },
                    address: p.vicinity || p.formatted_address || "",
                    photoUrl,
                    raw: p,
                };
            });
            setPois(mapped);
        });
    }

    const savePoi = async (poi, mode = "visited") => {
        if (!db || !user || !selectedTrip?.trip_id) {
            if (setToast) setToast({ msg: "Sign in and select a trip to save sights", type: "warning" });
            return;
        }
        const tripId = selectedTrip.trip_id;
        const key = `google:${poi.place_id}`;
        if (existing.has(key)) {
            if (setToast) setToast({ msg: "Already saved to this trip", type: "info" });
            return;
        }
        try {
            const sightsCol = collection(db, "trips", tripId, "sights");
            const payload = {
                provider: "google",
                placeId: poi.place_id,
                name: poi.name,
                category: poi.category || "",
                location: { lat: poi.location.lat, lng: poi.location.lng, address: poi.address || "" },
                photoUrl: poi.photoUrl || "",
                tripId,
                mode,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            };
            await addDoc(sightsCol, payload);
            setExisting((s) => new Set(Array.from(s).concat([key])));
            if (setToast) setToast({ msg: `${poi.name} saved (${mode})`, type: "success" });
        } catch (err) {
            console.error("save poi error", err);
            if (setToast) setToast({ msg: "Failed to save sight", type: "warning" });
        }
    };

    const onInputKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const t = query && query.trim();
            if (t) {
                searchPlaceByText(t);
            }
        }
    };

    return (
        <div style={{ marginBottom: 6 }}>
            {/* Only show Add sightseeing button to the trip owner */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                }}
            >
                <div style={{ fontWeight: 600 }}>Places I Visited</div>

                {isOwner && (
                    <button
                        onClick={() => setOpen(true)}
                        className="btn-start"
                        style={{ padding: "6px 10px", fontSize: 13 }}
                    >
                        + Add sightseeing
                    </button>
                )}
            </div>

            {open && (
                <Modal title="Add sightseeing" onClose={() => setOpen(false)}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 360 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onInputKeyDown}
                                placeholder="Type a city or place (e.g. Aguda Fort, Goa)"
                                style={{ flex: 1, padding: "8px 10px" }}
                            />
                            <button onClick={useCurrent} className="btn-secondary">Use me</button>
                            <button onClick={() => { if (query && query.trim()) searchPlaceByText(query.trim()); }} className="btn-secondary">Search</button>
                        </div>

                        {suggestions.length > 0 && (
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 160, overflow: "auto", border: "1px solid #eee", borderRadius: 6 }}>
                                {suggestions.map(s => (
                                    <li key={s.place_id} onClick={() => pickSuggestion(s)} style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #f6f6f6" }}>{s.description}</li>
                                ))}
                            </ul>
                        )}

                        <div style={{ fontSize: 13, color: "#666" }}>
                            {center ? <strong>Showing places around:</strong> : <strong>Pick a location to list places</strong>}
                            {center && <div style={{ marginTop: 6 }}>{center.name} ({center.lat.toFixed(4)}, {center.lng.toFixed(4)})</div>}
                        </div>

                        <div style={{ minHeight: 160 }}>
                            {loading ? <div className="muted">Loading places…</div> : pois.length === 0 ? <div className="muted">No places loaded yet.</div> : (
                                <div style={{ display: "grid", gap: 8, maxHeight: 340, overflow: "auto" }}>
                                    {pois.map(p => {
                                        const key = `google:${p.place_id}`;
                                        const already = existing.has(key);
                                        return (
                                            <div key={key} style={{ display: "flex", gap: 10, padding: 8, borderRadius: 8, border: "1px solid #f0f0f0", alignItems: "center" }}>
                                                <div style={{ width: 60, height: 60, borderRadius: 6, overflow: "hidden", background: "#f6f6f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    {p.photoUrl ? <img src={p.photoUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ fontSize: 12, color: "#999" }}>No photo</div>}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                                    <div style={{ fontSize: 12, color: "#666" }}>{p.category} {p.address ? `· ${p.address}` : ""}</div>
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                    <button onClick={() => savePoi(p, "visited")} className="btn-start" disabled={already} style={{ fontSize: 12, padding: "6px 8px" }}>{already ? "Saved" : "Mark visited"}</button>
                                                    <button onClick={() => savePoi(p, "planned")} className="btn-secondary" disabled={already} style={{ fontSize: 12, padding: "6px 8px" }}>{already ? "Saved" : "Plan visit"}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button className="btn-cancel" onClick={() => setOpen(false)}>Close</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
