import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        chrome: "readonly",
        HTMLElement: "readonly",
        ShadowRoot: "readonly",
        MutationObserver: "readonly",
        AudioContext: "readonly",
        SpeechRecognition: "readonly",
        webkitSpeechRecognition: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        Map: "readonly",
        Set: "readonly",
        Promise: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        process: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
    },
  },
  {
    ignores: [
      ".output/",
      ".wxt/",
      "node_modules/",
      "convex/_generated/",
      "dist/",
    ],
  },
];
