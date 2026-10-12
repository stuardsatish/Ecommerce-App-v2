const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = [
  ...expoConfig,
  {
    settings: {
      "import/resolver": {
        alias: {
          map: [
            ["@/assets", "./assets"],
            ["@", "./src"],
          ],
          extensions: [".js", ".jsx", ".json"],
        },
      },
    },
  },
  {
    files: ["__tests__/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
  },
];