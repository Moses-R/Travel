import React from "react";
import HomePage from "./pages/Home";
import Test from "./pages/Test";

function PathInspector() {
  const path = window.location.pathname || "";
  const m = path.match(/^\/@([^\/]+)/); // capture handle after /@
  if (m) {
    // pass the handle explicitly as a prop so Test can use it reliably
    return <Test externalHandle={m[1]} />;
  }
  return <HomePage />;
}
