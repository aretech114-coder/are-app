/**
 * Centralized application constants for ARE App.
 * APP_DOMAIN defaults to the production domain; override via VITE_APP_DOMAIN for preview/staging.
 */
export const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || "are-app.cloud";
export const APP_NAME = "ARE App";
export const APP_URL = `https://${APP_DOMAIN}`;
