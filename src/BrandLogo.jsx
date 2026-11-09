import React from "react";
import { LOGO_URL, BRAND_NAME } from "./brand";
export default function BrandLogo({ className = "" }) {
  return (
    <img
      src={LOGO_URL}
      alt={BRAND_NAME}
      className={"ghaith-logo " + className}
      draggable="false"
    />
  );
}
