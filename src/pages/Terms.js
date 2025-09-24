import React from "react";
import { Link } from "react-router-dom";

export default function Terms() {
    return (
        <div style={{ maxWidth: 880, margin: "40px auto", padding: 20 }}>
            <h1>Terms & Conditions</h1>
            <p>
                Effective Date: {new Date().toLocaleDateString()}
            </p>

            <p>
                Welcome to Jift (“we,” “our,” “us”). By accessing or using our website,
                mobile application, and related services (collectively, the “Services”),
                you agree to these Terms & Conditions. Please read them carefully.
            </p>

            <h2>1. Eligibility</h2>
            <p>
                You must be at least 13 years old to use Jift. By creating an account,
                you confirm that you meet this age requirement and that you are legally
                capable of entering into this agreement.
            </p>

            <h2>2. Account Registration</h2>
            <ul>
                <li>
                    You may register for an account using Google login. We collect your
                    email, display name, and profile picture to set up your profile.
                </li>
                <li>
                    You are responsible for maintaining the confidentiality of your account
                    credentials and all activity under your account.
                </li>
                <li>
                    You agree to provide accurate information and keep it updated.
                </li>
            </ul>

            <h2>3. Acceptable Use</h2>
            <p>You agree not to use the Services to:</p>
            <ul>
                <li>Violate any applicable law or regulation.</li>
                <li>Post content that is unlawful, defamatory, harassing, obscene, or harmful.</li>
                <li>Infringe on the rights of others, including intellectual property rights.</li>
                <li>Attempt to hack, disrupt, or overload our systems.</li>
            </ul>

            <h2>4. User Content</h2>
            <ul>
                <li>
                    You retain ownership of the content (photos, videos, trip details,
                    stories) you post on Jift.
                </li>
                <li>
                    By posting, you grant us a non-exclusive, worldwide, royalty-free
                    license to host, display, and distribute your content solely for the
                    purpose of operating and improving the Services.
                </li>
                <li>
                    You are responsible for ensuring you have the right to upload the
                    content you share.
                </li>
            </ul>

            <h2>5. Our Authority Over Accounts & Content</h2>
            <p>
                Jift reserves the full right and authority to manage user profiles and
                content hosted on our platform. This includes, but is not limited to:
            </p>
            <ul>
                <li>Editing or modifying user-submitted information or content.</li>
                <li>Removing or deleting content that violates our policies or is deemed inappropriate.</li>
                <li>Banning, suspending, or permanently terminating user accounts at our discretion.</li>
                <li>Restricting access to certain features or Services without prior notice.</li>
            </ul>
            <p>
                By using Jift, you acknowledge and agree that your account and content
                are subject to these terms and our moderation authority.
            </p>

            <h2>6. Mobile App Permissions</h2>
            <p>
                Our mobile app may request permission to access your device’s{" "}
                <strong>camera</strong>, <strong>gallery</strong>, and{" "}
                <strong>location</strong>. These features are optional but required to
                use Jift to its full potential (e.g., trip sharing, live tracking,
                uploading media). You can manage permissions in your device settings.
            </p>

            <h2>7. Intellectual Property</h2>
            <p>
                All trademarks, logos, and software related to Jift are owned by us and
                protected under applicable intellectual property laws. You may not copy,
                modify, or distribute our Services without permission.
            </p>

            <h2>8. Termination</h2>
            <p>
                We may suspend or terminate your account if you violate these Terms,
                misuse the Services, or for any reason at our sole discretion. Upon
                termination, your right to use the Services will immediately end.
            </p>

            <h2>9. Disclaimers</h2>
            <ul>
                <li>
                    Jift is provided “as is” without warranties of any kind, either
                    express or implied.
                </li>
                <li>
                    We do not guarantee that the Services will always be available,
                    secure, or error-free.
                </li>
                <li>
                    Travel information shared by users may not be accurate — you use it at
                    your own risk.
                </li>
            </ul>

            <h2>10. Limitation of Liability</h2>
            <p>
                To the fullest extent permitted by law, Jift and its team shall not be
                liable for any indirect, incidental, special, or consequential damages
                arising out of or related to your use of the Services.
            </p>

            <h2>11. Changes to These Terms</h2>
            <p>
                We may update these Terms from time to time. Continued use of the
                Services after changes means you accept the revised Terms.
            </p>

            <h2>12. Governing Law</h2>
            <p>
                These Terms are governed by and construed under the laws of your
                country of residence, unless otherwise required by local laws.
            </p>

            <h2>13. Contact Us</h2>
            <p>
                If you have questions about these Terms, please contact us at: <br />
                <strong>Email:</strong>{" "}
                <a href="mailto:support@jift.io">support@jift.io</a>
            </p>

            <div style={{ marginTop: 28 }}>
                <Link to="/">← Back to Home</Link>
            </div>
        </div>
    );
}
