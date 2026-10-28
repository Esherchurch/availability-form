/* ESLint for Church HQ (ENGINEERING.md §4): the recommended rules, one
 * config for the three kinds of JavaScript here.
 *
 *   npx eslint .            (from v2/)
 *
 * Report-only for now: CI runs it and shows the result, nothing is blocked
 * and nothing has been reformatted yet. Rules that would flag most of the
 * existing code are warnings, so a new error stands out.
 *
 * Inline <script> blocks in the .html pages are not linted yet: that needs
 * eslint-plugin-html, which comes with moving each page's script into its
 * own .js file (ENGINEERING.md §3).
 */
import js from '@eslint/js';
import globals from 'globals';

const shared = {
  /* Warnings, not errors, while the existing code is brought up to them. */
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-useless-escape': 'warn',
  'no-prototype-builtins': 'warn',
  'no-inner-declarations': 'off',
  'no-control-regex': 'off',
  /* Real mistakes stay errors. */
  'no-undef': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error'
};

export default [
  {
    ignores: [
      'node_modules/**', 'functions/node_modules/**',
      /* Not Church HQ's code: pictures, mock-ups, other tools' copies. */
      'bibles/**', 'brand/**', 'design/**', 'design-mocks/**', 'screenshots/**', 'img/**',
      'converter/**', 'ease-test/**', 'mix-tests/**', 'monitor-bridge/**',
      /* Built files: made by tools/, checked by their own tests. */
      'functions/notify-core.cjs', 'functions/safeguarding-core.cjs', 'functions/team-jobs.js', 'functions/permissions-core.js'
    ]
  },
  js.configs.recommended,
  /* The shared page scripts (egbc-*.js and the rest at the top): plain
     browser scripts that each add one global (window.EGBCAuth...). */
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, firebase: 'readonly', lucide: 'readonly', module: 'readonly', globalThis: 'readonly' }
    },
    rules: { ...shared, 'no-undef': 'warn' }
  },
  /* The few page scripts written as modules. */
  { files: ['egbc-db.js', 'eslint.config.js'], languageOptions: { sourceType: 'module' } },
  /* Cloud Functions: Node 22, ES modules. */
  {
    files: ['functions/**/*.js', 'functions/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: shared
  },
  /* Shared copies of page scripts (notify-core, sermons-feed...): one file
     for the browser and Node, so both sets of globals. */
  { files: ['functions/**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }, rules: shared },
  /* Tests and tools: Node scripts; the browser checks also run code in pages. */
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', '*.mjs', 'tools/**/*.cjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: shared
  },
  { files: ['tools/**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  /* The Cloudflare Worker in front of each church's address. */
  { files: ['tools/cloudflare/**/*.js'], languageOptions: { sourceType: 'module', globals: { ...globals.serviceworker } }, rules: shared }
];
