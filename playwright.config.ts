import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:5173"
  }
});