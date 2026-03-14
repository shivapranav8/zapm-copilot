
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// No global fetch prefixing needed for Vercel.
// Use apiFetch or relative /api/... paths.

console.log("ANTIGRAVITY_ROUTING_FIX_V2_LOADED");
createRoot(document.getElementById("root")!).render(<App />);
