// functions/index.js
const admin = require("firebase-admin");

admin.initializeApp();

// Re-export each function from its module
exports.api = require("./api").api;
exports.autoStopExpiredTrips = require("./cron/autoStopExpiredTrips")
    .autoStopExpiredTrips;
exports.markNotificationRead = require("./notifications/markNotificationRead")
    .markNotificationRead;
