// functions/api.js
const functions = require("firebase-functions");
const admin = require("firebase-admin"); // DO NOT call initializeApp here
const express = require("express");
const cors = require("cors");

const db = admin.firestore();

const makeCheckSlug = require("./routes/checkSlug");
const makeCreateTrip = require("./routes/createTrip");
const makeSearch = require("./routes/search");

const app = express();
app.use(cors({origin: true}));
app.use(express.json());

// mount existing routes (they are factory functions that accept db)
app.use("/", makeCheckSlug(db));
app.use("/", makeCreateTrip(db));
app.use("/", makeSearch(db));

// export as https function
exports.api = functions.https.onRequest(app);
