import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Required for GitHub Pages: site serves from /will-it-fit/
  base: "/will-it-fit/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
