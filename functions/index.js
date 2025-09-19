const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({origin: true}));
app.use(express.json());

const makeCheckSlug = require("./routes/checkSlug");
const makeCreateTrip = require("./routes/createTrip");

app.use("/", makeCheckSlug(db));
app.use("/", makeCreateTrip(db));

exports.api = functions.https.onRequest(app);
