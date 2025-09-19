import React from "react";
import { useParams } from "react-router-dom";

export default function Test({ externalHandle }) {
  const params = useParams();
  const handle = externalHandle ?? params.handle ?? (() => {
    // fallback parse if needed
    const m = (window.location.pathname || "").match(/^\/@([^\/]+)/);
    return m ? m[1] : null;
  })();

  console.log("handler:", handle);
  return (
    <div>
      <h1>{handle ? `${handle}'s profile` : 'No handle'}</h1>
      <h2>Test Page hi</h2>
    </div>
  );
}
