import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000", changeOrigin: true } },
  },
  preview: { port: 4173, proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1100, // the three.js chunk is large but only loads with a 3D scene
    rolldownOptions: {
      output: {
        // Explicit groups that don't capture their dependencies: otherwise react-leaflet would pull React into the
        // map chunk and drei would pull ReactDOM into the 3D chunk, making both load on every page.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            // the 3D stack (three, react-three-fiber, drei and helpers, the globe's land data) loads only with a scene
            { name: "three", priority: 30, test: /node_modules[\\/](three|three-[^\\/]+|@react-three|troika-[^\\/]+|maath|meshline|camera-controls|@monogrid|detect-gpu|suspend-react|its-fine|zustand|react-reconciler|@use-gesture|stats-gl|stats\.js|tunnel-rat|topojson-client)[\\/]/ },
            // each Natural Earth dataset is its own lazily fetched chunk (phones only ever load the small one)
            { name: (id) => `geo-${id.split(/[\\/]/).pop()!.replace(".json", "")}`, priority: 40, test: /node_modules[\\/]world-atlas[\\/]/ },
            { name: "gsap", priority: 30, test: /node_modules[\\/]gsap[\\/]/ }, // scroll choreography, imported on demand
            { name: "map", priority: 20, test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/ },
            { name: "motion", priority: 20, test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            { name: "vendor", priority: 10, test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // the first render in each file pays for jsdom + framer-motion start-up, which can exceed 5 s on slow machines
    testTimeout: 30_000,
  },
});
