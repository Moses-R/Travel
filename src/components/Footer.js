import React from "react";
import { Link } from "react-router-dom";
import "./css/Footer.css";

export default function Footer() {
    return (
        <footer className="jift-footer" role="contentinfo" aria-label="Footer">
            <div className="jift-footer__left">
                <div className="jift-footer__brand">Jift</div>
                <div className="jift-footer__tag">· Built with ❤️ · creator-friendly</div>
            </div>

            <div className="jift-footer__right" aria-hidden={false}>
                <Link to="/privacy" className="jift-footer__link">Privacy</Link>
                <span className="jift-footer__dot" aria-hidden>·</span>
                <Link to="/terms" className="jift-footer__link">Terms</Link>
                <span className="jift-footer__dot" aria-hidden>·</span>
                <Link to="/contact" className="jift-footer__link">Contact</Link>
                <span className="jift-footer__copy" aria-hidden>© {new Date().getFullYear()} Jift</span>
            </div>
        </footer>
    );
}
