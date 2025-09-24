import React from "react";
import { Link } from "react-router-dom";

export default function Privacy() {
    return (
        <div style={{ maxWidth: 880, margin: "40px auto", padding: 20 }}>
            <h1>Privacy Policy</h1>
            <p>Effective Date: {new Date().toLocaleDateString()}</p>

            <p>
                Jift (“we,” “our,” or “us”) is committed to protecting your privacy.
                This Privacy Policy explains how we collect, use, disclose, and safeguard
                your information when you use our website, mobile application, and
                related services (collectively, the “Services”).
            </p>

            <h2>1. Information We Collect</h2>
            <p>We collect the following types of information when you use our Services:</p>
            <ul>
                <li>
                    <strong>Account Information:</strong> When you sign up or log in using
                    Google, we collect your email address, display name, and profile
                    picture.
                </li>
                <li>
                    <strong>Trip and Profile Content:</strong> When you create or share
                    trips, stories, or media, we store that information as part of your
                    profile.
                </li>
                <li>
                    <strong>Device Permissions (Mobile App):</strong> To enable full
                    functionality, our mobile app may request access to:
                    <ul>
                        <li>
                            <em>Camera</em> – capture and upload photos/videos for profiles,
                            trips, or travel stories.
                        </li>
                        <li>
                            <em>Gallery</em> – select and upload existing media from your
                            device.
                        </li>
                        <li>
                            <em>Location</em> – enable live trip tracking, route maps, and
                            location-based features.
                        </li>
                    </ul>
                </li>
                <li>
                    <strong>Device Identifiers & Diagnostics:</strong> Non-identifying
                    technical info (e.g., device model, OS version, crash reports, IP
                    address) to maintain performance and security.
                </li>
                <li>
                    <strong>Usage Data:</strong> Browser type, operating system, app usage
                    patterns, and other analytics to improve service quality.
                </li>
            </ul>

            <h2>2. How We Use Your Information</h2>
            <ul>
                <li>Provide and improve our Services.</li>
                <li>Personalize your experience and display relevant content.</li>
                <li>Enable features like trip sharing, maps, and following creators.</li>
                <li>Secure our platform and prevent misuse or fraud.</li>
                <li>Communicate with you about updates, support, or important notices.</li>
            </ul>
            <p>
                <strong>Note:</strong> We do not use your camera, gallery, or location
                data for advertising purposes.
            </p>

            <h2>3. Information We Do Not Collect or Sell</h2>
            <ul>
                <li>
                    We do not collect sensitive financial information (like payment cards)
                    through Jift directly.
                </li>
                <li>
                    We do not sell, rent, or trade your personal data to third parties.
                </li>
            </ul>

            <h2>4. How We Share Information</h2>
            <p>We only share your information in the following limited circumstances:</p>
            <ul>
                <li>With your consent (e.g., when you make your trips public).</li>
                <li>
                    With trusted service providers who help us operate the Services (e.g.,
                    hosting, analytics), bound by confidentiality agreements.
                </li>
                <li>If required by law or to protect rights, safety, and property.</li>
            </ul>

            <h2>5. Data Retention</h2>
            <ul>
                <li>Camera and gallery uploads remain until you delete them.</li>
                <li>
                    Location history is stored only during active trips unless you save it
                    as part of a trip record.
                </li>
                <li>
                    We retain account information while your account is active. You may
                    delete your account at any time, after which your personal information
                    will be removed (except where legally required to retain it).
                </li>
            </ul>

            <h2>6. Your Choices</h2>
            <ul>
                <li>You may update your account details in your profile settings.</li>
                <li>
                    You can revoke mobile app permissions (camera, gallery, location) in
                    your device settings.
                </li>
                <li>
                    You may request deletion of your account/data by contacting us at{" "}
                    <a href="mailto:support@jift.io">support@jift.io</a>.
                </li>
            </ul>

            <h2>7. Security</h2>
            <p>
                We use industry-standard safeguards including encryption, secure
                authentication, and monitoring. However, no online platform can
                guarantee absolute security.
            </p>

            <h2>8. Children’s Privacy</h2>
            <p>
                Our Services are not directed to children under 13. If we discover we
                have collected such information, we will delete it promptly.
            </p>

            <h2>9. Changes to This Privacy Policy</h2>
            <p>
                We may update this Privacy Policy from time to time. Any material
                changes will be communicated through the website or mobile app.
            </p>

            <h2>10. Contact Us</h2>
            <p>
                If you have any questions or concerns about this Privacy Policy, please
                contact us at: <br />
                <strong>Email:</strong>{" "}
                <a href="mailto:support@jift.io">support@jift.io</a> <br />
                <strong>Address:</strong> [Insert business/legal address here]
            </p>

            <div style={{ marginTop: 28 }}>
                <Link to="/">← Back to Home</Link>
            </div>
        </div>
    );
}
