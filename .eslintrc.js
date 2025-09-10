module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'google',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  rules: {
    // Google Apps Script specific adjustments
    'max-len': ['error', {
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    }],
    'require-jsdoc': 'off', // GAS functions often don't need JSDoc
    'valid-jsdoc': 'off',
    'camelcase': ['error', {
      allow: ['^[A-Z][a-zA-Z0-9_]*$', '^[a-z]+_[a-z_]+$'], // Allow CONSTANT_CASE and snake_case for GAS
      properties: 'never',
    }],
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_', // Allow unused params starting with _
      varsIgnorePattern: '^_',
    }],
    'no-undef': 'error',
    'no-console': 'off', // GAS doesn't have console, but allow for debugging
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'template-curly-spacing': 'error',
    'arrow-spacing': 'error',
    'comma-dangle': ['error', 'always-multiline'],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'indent': ['error', 2],
    'space-before-function-paren': ['error', 'never'],
    'keyword-spacing': 'error',
    'space-infix-ops': 'error',
    'eol-last': 'error',
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
    'brace-style': ['error', '1tbs', { allowSingleLine: true }],
    'curly': ['error', 'all'],
    'eqeqeq': ['error', 'always'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'error',
    'no-empty': 'error',
    'no-extra-boolean-cast': 'error',
    'no-extra-semi': 'error',
    'no-regex-spaces': 'error',
    'no-unreachable': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',
    'linebreak-style': 'off', // Disable linebreak style for Windows compatibility
    'spaced-comment': 'off', // Allow comments without spaces
    'guard-for-in': 'off', // Allow for-in loops without guards in GAS
    'one-var': 'off', // Allow multiple variable declarations
    'no-multi-spaces': 'off', // Allow multiple spaces for alignment
    'operator-linebreak': 'off', // Allow operators at beginning of line
    'block-spacing': 'off', // Allow spaces in blocks
    'key-spacing': 'off', // Allow flexible key spacing
    'comma-spacing': 'off', // Allow flexible comma spacing
    'object-curly-spacing': 'off', // Allow flexible object spacing
    'arrow-parens': 'off', // Allow arrow functions without parentheses
    'space-before-blocks': 'off', // Allow flexible space before blocks
  },
  globals: {
    // Google Apps Script globals
    'SpreadsheetApp': 'readonly',
    'ScriptApp': 'readonly',
    'HtmlService': 'readonly',
    'Session': 'readonly',
    'Utilities': 'readonly',
    'UrlFetchApp': 'readonly',
    'PropertiesService': 'readonly',
    'LockService': 'readonly',
    'Logger': 'readonly',
    'MailApp': 'readonly',
    'DriveApp': 'readonly',
    'DocumentApp': 'readonly',
    'FormApp': 'readonly',
    'SlidesApp': 'readonly',
    'CalendarApp': 'readonly',
    'GmailApp': 'readonly',
    'MapsApp': 'readonly',
    'LanguageApp': 'readonly',
    'Charts': 'readonly',
    'XmlService': 'readonly',
    'Jdbc': 'readonly',
    'CacheService': 'readonly',
    'ScriptDb': 'readonly',
    'UserProperties': 'readonly',
    'ScriptProperties': 'readonly',
    'DocumentProperties': 'readonly',
    'console': 'readonly', // For debugging
  },
};
