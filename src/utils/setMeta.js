// src/utils/setMeta.js
export function setFavicon(url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.href = url;
}

export function setTitle(title) {
    document.title = title;
}
