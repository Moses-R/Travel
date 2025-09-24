// utils/share.js
export async function safeShare({ url, title = "", text = "", onToast = (msg, type) => { } }) {
    try {
        // 1) Native Web Share API
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
                onToast("Shared via device share sheet", "success");
                return { ok: true, method: "navigator.share" };
            } catch (err) {
                // dismissed or failed — continue to other methods
                console.debug("navigator.share dismissed/failed:", err);
            }
        }

        // 2) Clipboard API
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            try {
                await navigator.clipboard.writeText(url);
                onToast("Link copied to clipboard", "success");
                return { ok: true, method: "clipboard-api" };
            } catch (err) {
                console.warn("clipboard.writeText failed:", err);
            }
        }

        // 3) execCommand fallback
        try {
            const ta = document.createElement("textarea");
            ta.value = url;
            ta.setAttribute("readonly", "");
            ta.style.position = "absolute";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            if (ok) {
                onToast("Link copied to clipboard (fallback)", "success");
                return { ok: true, method: "execCommand" };
            }
        } catch (err) {
            console.error("execCommand copy failed:", err);
        }

        // 4) Last resort: show prompt for manual copy
        window.prompt("Copy this link:", url);
        onToast("Prompt opened with link", "info");
        return { ok: false, method: "prompt" };
    } catch (err) {
        console.error("safeShare unexpected error:", err);
        onToast("Unable to share", "warning");
        return { ok: false, method: "error", error: err };
    }
}
