// src/pages/UserByHandle.jsx
import React from "react";
import TravelPage from "./Travel";

/**
 * UserByHandle route placeholder.
 * Travel.jsx reads `:handle` from route params itself, so just render it.
 */
export default function UserByHandle() {
  return <TravelPage />;
}
