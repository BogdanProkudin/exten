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
    permissions: ["storage", "alarms", "activeTab", "contextMenus"],
    commands: {
      "translate-selection": {
        suggested_key: {
          default: "Ctrl+Shift+T",
          mac: "MacCtrl+Shift+T",
        },
        description: "Translate selected word with Vocabify",
      },
    },
    host_permissions: [
      "https://api.mymemory.translated.net/*",
      "https://libretranslate.com/*",
      "https://translate.googleapis.com/*",
      "https://api.datamuse.com/*",
      "https://api.dictionaryapi.dev/*",
    ],
  },
});
