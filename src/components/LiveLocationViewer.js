import React, { useEffect, useState } from "react";

// LiveLocationViewer
// - A small, self-contained React component to display a single live-location object
// - Shows a Google Maps embed centered on lat/lng, basic metadata (name, photo, accuracy, updatedAt)
// - Restricts display to allowed users only
// - Props:
//    liveLocation: { uid, displayName, lat, lng, accuracy, photoURL, sharing, updatedAt, visibility }
//    allowedUsers: array of user ids (strings) that may view the location
//    currentUserId: id of the signed-in user
//    mapZoom (optional): number, default 18
//    mapHeight (optional): tailwind height class or px value (default 'h-64')

export default function LiveLocationViewer({
    liveLocation,
    allowedUsers = [],
    currentUserId,
    mapZoom = 18,
    mapHeight = "h-64",
}) {
    const [isAllowed, setIsAllowed] = useState(false);
    const [mapKey, setMapKey] = useState(0); // force iframe reload when location updates

    useEffect(() => {
        if (!liveLocation) {
            setIsAllowed(false);
            return;
        }

        // normalize allowedUsers into array of strings
        const rawAllowed = Array.isArray(liveLocation.allowedUsers)
            ? liveLocation.allowedUsers
            : (liveLocation.allowed_users || []);
        const allowedNormalized = rawAllowed.map((a) => (a == null ? "" : String(a)));

        const curId = currentUserId ? String(currentUserId) : "";

        // Owner is always allowed (document.uid is owner id in your data)
        const isOwner = curId && String(liveLocation.uid) === curId;

        // membership check
        const isInAllowed = curId && allowedNormalized.includes(curId);

        if (liveLocation.visibility === "public") {
            setIsAllowed(true);
        } else if (liveLocation.visibility === "restricted") {
            setIsAllowed(Boolean(isOwner || isInAllowed));
        } else {
            setIsAllowed(Boolean(isOwner || isInAllowed));
        }
    }, [liveLocation, currentUserId]);

    useEffect(() => {
        // bump mapKey when updatedAt changes so iframe reloads
        if (liveLocation && liveLocation.updatedAt) {
            setMapKey((k) => k + 1);
        }
    }, [liveLocation && liveLocation.updatedAt]);

    if (!liveLocation) {
        return (
            <div className="p-4 bg-white rounded shadow-sm">
                <p className="text-sm text-gray-600">No live location provided.</p>
            </div>
        );
    }

    if (!isAllowed) {
        return (
            <div className="p-4 bg-white rounded shadow-sm">
                <p className="text-sm text-red-600">You are not authorized to view this live location.</p>
            </div>
        );
    }

    const { lat, lng, displayName, photoURL, accuracy, updatedAt, sharing, uid } = liveLocation;

    // Build a simple google maps embed query centered on the coordinates.
    // This uses the public maps "q" parameter and output=embed. Works for simple views.
    const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(lat + "," + lng)}&z=${mapZoom}&output=embed`;

    return (
        <div className="bg-white rounded-2xl shadow-md overflow-hidden max-w-2xl">
            <div className="flex items-center gap-3 p-4">
                <img
                    src={photoURL}
                    alt={`${displayName} avatar`}
                    className="w-12 h-12 rounded-full object-cover border" />
                <div>
                    <div className="text-lg font-medium">{displayName}</div>
                    <div className="text-sm text-gray-500">{uid}</div>
                </div>
                <div className="ml-auto text-right text-sm">
                    <div className="text-xs text-gray-500">Accuracy</div>
                    <div className="font-semibold">{accuracy ? `${Number(accuracy).toFixed(1)} m` : "—"}</div>
                </div>
            </div>

            <div className={`w-full ${mapHeight}`}>
                {/* key forces reload when updatedAt changes */}
                <iframe
                    key={mapKey}
                    title={`live-location-${uid}`}
                    src={mapSrc}
                    className="w-full h-full border-0"
                    allowFullScreen
                />
            </div>

            <div className="p-3 border-t flex items-center justify-between text-sm text-gray-600">
                <div>
                    <div>Sharing: {sharing ? "On" : "Off"}</div>
                    <div>Updated: {updatedAt || "—"}</div>
                </div>
                <div>
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block px-3 py-1 rounded-lg border text-sm hover:bg-gray-50"
                    >
                        Open in Maps
                    </a>
                </div>
            </div>
        </div>
    );
}