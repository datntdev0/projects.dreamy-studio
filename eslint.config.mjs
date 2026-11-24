import js from "@eslint/js";
import angular from "@angular-eslint/eslint-plugin";
import angularTemplate from "@angular-eslint/eslint-plugin-template";
import angularTemplateParser from "@angular-eslint/template-parser";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["_output/**", "**/node_modules/**"],
  },
  {
    files: ["angular/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import/no-duplicates": ["error", { "prefer-inline": true }],
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
    },
  },
  {
    files: ["angular/**/*.ts"],
    plugins: {
      "@angular-eslint": angular,
      "@angular-eslint/template": angularTemplate,
    },
    processor: angularTemplate.processors["extract-inline-html"],
    rules: {
      "@angular-eslint/component-selector": [
        "error",
        { type: ["element", "attribute"], prefix: ["app", "ds"], style: "kebab-case" },
      ],
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: ["app", "ds"], style: "camelCase" },
      ],
    },
  },
  {
    files: ["angular/**/*.html"],
    plugins: {
      "@angular-eslint/template": angularTemplate,
    },
    languageOptions: {
      parser: angularTemplateParser,
    },
    rules: {
      "@angular-eslint/template/banana-in-box": "error",
      "@angular-eslint/template/eqeqeq": "error",
    },
  },
);
