// Everything that is easy to change lives here.
// The name comes from VITE_APP_NAME (frontend/.env.development locally, Vercel's environment variables when deployed).
export const APP_NAME = import.meta.env.VITE_APP_NAME || "Wrappd";
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// Same rules as the server – checked in the browser only to give a quick answer
export const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];
