module.exports = {
  root: true,
  ignorePatterns: ["node_modules", "dist", ".next", "coverage", "drizzle"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-non-null-assertion": "off"
  },
  overrides: [
    {
      files: ["apps/web/**/*.{ts,tsx}"],
      extends: ["next/core-web-vitals"]
    },
    {
      files: ["**/*.tsx"],
      plugins: ["react-hooks"],
      extends: ["plugin:react-hooks/recommended"]
    }
  ]
};
