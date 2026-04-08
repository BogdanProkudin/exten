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
    author: { email: "vocabify@example.com" },
    homepage_url: "https://github.com/BogdanProkudin/exten",
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    permissions: ["storage", "alarms", "activeTab", "contextMenus", "scripting", "idle", "offscreen"],
    commands: {
      "translate-selection": {
        suggested_key: {
          default: "Ctrl+Shift+T",
          mac: "MacCtrl+Shift+T",
        },
        description: "Translate selected word with Vocabify",
      },
      "open-dashboard": {
        suggested_key: {
          default: "Ctrl+Shift+V",
          mac: "MacCtrl+Shift+V",
        },
        description: "Open Vocabify Dashboard",
      },
    },
    web_accessible_resources: [
      { resources: ["data/*"], matches: ["<all_urls>"] },
    ],
    host_permissions: [
      "https://api.mymemory.translated.net/*",
      "https://libretranslate.com/*",
      "https://translate.googleapis.com/*",
      "https://api.datamuse.com/*",
      "https://api.dictionaryapi.dev/*",
      "https://api.openai.com/*",
      "https://www.youtube.com/*",
    ],
  },
});
