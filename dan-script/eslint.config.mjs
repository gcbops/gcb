import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([

  {
    ignores: [
      "node_modules/**",
      "backend/**",
      "frontend/**",
      "build/**",
      ".git/**",
      ".clasp.json",
      "package-lock.json"
    ]
  },

  js.configs.recommended,

  {
    files: [
      "src/scripts.js"
    ],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",

      globals: {

          ...globals.browser,

          // Google Apps Script
          google: "readonly",
          google_script_host: "readonly",

          // jQuery
          $: "readonly",
          jQuery: "readonly",

          // Bootstrap
          bootstrap: "readonly",

          // Chart.js
          Chart: "readonly",

          // Toastr
          toastr: "readonly",

          // DataTables
          DataTable: "readonly",

          // Select2
          select2: "readonly",

          // Perfect Scrollbar
          PerfectScrollbar: "readonly",

          // MetisMenu
          MetisMenu: "readonly",

          // Browser
          localStorage: "readonly",
          sessionStorage: "readonly",
          navigator: "readonly",
          MutationObserver: "readonly"
      }
    },

    rules: {

        "curly": "error",

        "eqeqeq": "warn",

        "prefer-const": "warn",

        "no-var": "warn",

        "no-console": "off",

        "semi": ["warn", "always"],

        "no-unused-vars": [
            "warn",
            {
                args: "none",
                ignoreRestSiblings: true
            }
        ]
    }
  }

]);