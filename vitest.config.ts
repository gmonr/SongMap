import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirror tsconfig's "@/*" path alias so tests can import like source does.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
