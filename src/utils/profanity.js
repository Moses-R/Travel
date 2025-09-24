// src/utils/profanity.js
import { Filter } from "bad-words";

const filter = new Filter();

// Brand-related blocks
filter.addWords(
    "jift",
    "jiftio",
    "jiftapp",
    "jiftteam",
    "jiftadmin",
    "officialjift",
    "getjift",
    "myjift",
    "jiftstaff",
    "supportjift",
    "jifthelp",
    "jifthelpdesk",
    "jiftofficial",
    "jiftcommunity",
    "jiftplatform",
    "jiftservice",
    "jiftnetwork",
    "jiftworld",
    "jiftglobal",
    "jiftappsupport",
    "jiftapphelp",
    "jiftappteam",
    "jiftappofficial",
    "jiftappadmin",
    "jiftappstaff",
    "jiftappmoderator",
    "jiftappmod",
    "jiftappsystem",
    "jiftapproot",
    "jiftappoperator",
    "jiftappsuperuser",
);

filter.addWords(
    "ride",
    "rides",
    "rider",
    "riders",
    "drift",
    "drifts",
    "drifter",
    "drifters",
    "rideio",
    "rideapp",
    "rideadmin",
    "ridesupport",
    "ridehelp",
    "ridehelpdesk",
    "rideofficial",
    "ridecommunity",
    "rideplatform",
    "rideservice",
    "ridenetwork",
    "rideworld",
    "rideglobal",
    "rideappsupport",
    "rideapphelp",
    "rideappteam",
    "rideappofficial",
    "ride.is",
    "ride.io",
    "ride.i",
    "ride.app",
    "ride.co",
    "ride.net",
    "ride.org",
    "ride.us",
);

// Reserved keywords (staff/system terms)
filter.addWords(
    "support",
    "admin",
    "administrator",
    "moderator",
    "mod",
    "system",
    "root",
    "staff",
    "official",
    "help",
    "helpdesk",
    "team",
    "operator",
    "superuser"
);

// Whitelist: accounts that are allowed to use these words
const WHITELIST = [
    "support",       // for your official support account
    "jiftadmin",     // for internal use
    "jiftstaff",     // staff handles
    "officialjift",  // verified brand handle
];

/**
 * Checks if a string contains profanity or reserved words.
 * Skips check if the text is explicitly whitelisted.
 */
export function containsProfanity(text) {
    if (!text) return false;

    const lower = text.toLowerCase().trim();

    // If exact match in whitelist, skip
    if (WHITELIST.includes(lower)) {
        return false;
    }

    return filter.isProfane(lower);
}
