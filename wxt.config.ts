import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Vocabify",
    description: "Turn browsing into passive vocabulary learning",
    permissions: ["storage", "alarms", "activeTab"],
    host_permissions: [
      "https://api.mymemory.translated.net/*",
      "https://libretranslate.com/*",
    ],
  },
});
