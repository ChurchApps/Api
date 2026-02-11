import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

export default [
  {
    ignores: ["node_modules/", "dist/", "build/", "coverage/", "layer/", "*.config.js"]
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      "unused-imports": unusedImportsPlugin
    },
    rules: {
      // --- Code quality ---
      "prefer-const": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        args: "all",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }],
      "unused-imports/no-unused-imports": "error",

      // --- Formatting (ESLint is the sole formatter — no Prettier) ---
      "no-trailing-spaces": "error",
      "eol-last": ["error", "always"],
      "quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
      "semi": ["error", "always"],
      "comma-dangle": ["error", "never"],
      "indent": ["warn", 2, { SwitchCase: 1 }],
      "comma-spacing": ["error", { before: false, after: true }],
      "key-spacing": ["error", { beforeColon: false, afterColon: true, mode: "strict" }],
      "keyword-spacing": ["error", { before: true, after: true }],
      "space-infix-ops": "error",
      "no-multi-spaces": ["error", { ignoreEOLComments: true }],
      "block-spacing": ["error", "always"],

      // --- Compact / single-line formatting ---
      "brace-style": ["error", "1tbs", { allowSingleLine: true }],
      curly: ["error", "multi-line"],
      "nonblock-statement-body-position": ["error", "beside"],

      // Objects
      "object-curly-spacing": ["error", "always"],
      "object-curly-newline": ["error", {
        ObjectExpression: { multiline: true },
        ObjectPattern: { multiline: true },
        ImportDeclaration: { multiline: true },
        ExportDeclaration: { multiline: true }
      }],
      "object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],

      // Arrays
      "array-bracket-spacing": ["error", "never"],
      "array-bracket-newline": ["error", { multiline: true, minItems: 8 }],
      "array-element-newline": ["error", { ArrayExpression: "consistent", ArrayPattern: { minItems: 8 } }],

      // Functions
      "function-paren-newline": ["error", "consistent"],
      "function-call-argument-newline": ["error", "consistent"],

      // Generous line length
      "max-len": ["warn", {
        code: 250,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreComments: true,
        ignoreUrls: true,
        ignoreRegExpLiterals: true
      }],

      // Module separation rules for monolith
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/modules/attendance/**/*",
              from: "./src/modules/!(attendance)/**/*",
              message: "Attendance module should not import directly from other modules. Use shared interfaces or dependency injection."
            },
            {
              target: "./src/modules/content/**/*",
              from: "./src/modules/!(content)/**/*",
              message: "Content module should not import directly from other modules. Use shared interfaces or dependency injection."
            },
            {
              target: "./src/modules/doing/**/*",
              from: "./src/modules/!(doing)/**/*",
              message: "Doing module should not import directly from other modules. Use shared interfaces or dependency injection."
            },
            {
              target: "./src/modules/giving/**/*",
              from: "./src/modules/!(giving)/**/*",
              message: "Giving module should not import directly from other modules. Use shared interfaces or dependency injection."
            },
            {
              target: "./src/modules/membership/**/*",
              from: "./src/modules/!(membership)/**/*",
              message: "Membership module should not import directly from other modules. Use shared interfaces or dependency injection."
            },
            {
              target: "./src/modules/messaging/**/*",
              from: "./src/modules/!(messaging)/**/*",
              message: "Messaging module should not import directly from other modules. Use shared interfaces or dependency injection."
            }
          ]
        }
      ]
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json"
        }
      }
    }
  },
  {
    // Special rules for files that need cross-module access
    files: [
      "src/app.ts",
      "src/routes.ts",
      "src/lambda/**/*.ts",
      "src/shared/infrastructure/RepoManager.ts",
      "src/shared/helpers/StripeHelper.ts",
      "src/modules/*/index.ts"
    ],
    rules: {
      "import/no-restricted-paths": "off"
    }
  }
];
