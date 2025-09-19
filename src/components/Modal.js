// src/components/Modal.jsx
import React from "react";
import "./css/Modal.css";

export default function Modal({ title, children, onClose, width = 520 }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title || "Modal"}>
      <div className="modal-box" style={{ maxWidth: width }}>
        <div className="modal-header">
          {title && <h3 className="modal-title">{title}</h3>}
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
