// src/pages/Contact.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";

export default function Contact() {
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        // Replace with real submit behavior
        setSubmitted(true);
    };

    return (
        <div style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
            <h1>Contact Us</h1>

            {!submitted ? (
                <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
                    <label>
                        Your name
                        <input name="name" required style={{ width: "100%", padding: 8, marginTop: 6 }} />
                    </label>

                    <label>
                        Email
                        <input type="email" name="email" required style={{ width: "100%", padding: 8, marginTop: 6 }} />
                    </label>

                    <label>
                        Message
                        <textarea name="message" required rows={6} style={{ width: "100%", padding: 8, marginTop: 6 }} />
                    </label>

                    <div>
                        <button type="submit" className="hp-btn primary">Send message</button>
                    </div>
                </form>
            ) : (
                <div style={{ color: "#16a34a" }}>
                    Thanks — your message has been submitted. We'll get back to you soon.
                </div>
            )}

            <div style={{ marginTop: 20 }}>
                <Link to="/">← Back to home</Link>
            </div>
        </div>
    );
}
