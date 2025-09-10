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
    'camelcase': 'off', // Disable camelcase for GAS snake_case functions
    'no-unused-vars': ['warn', {
      argsIgnorePattern: '^_', // Allow unused params starting with _
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    }],
    'no-undef': 'warn', // Change to warning since GAS functions are defined in other files
    'no-console': 'off', // GAS doesn't have console, but allow for debugging
    'prefer-const': 'warn', // Change to warning for better development experience
    'no-var': 'warn', // Change to warning
    'object-shorthand': 'warn', // Change to warning
    'prefer-template': 'warn', // Change to warning
    'template-curly-spacing': 'warn', // Change to warning
    'arrow-spacing': 'warn', // Change to warning
    'comma-dangle': ['warn', 'always-multiline'], // Change to warning
    'semi': ['warn', 'always'], // Change to warning
    'quotes': ['warn', 'single', { avoidEscape: true }], // Change to warning
    'indent': ['warn', 2], // Change to warning
    'space-before-function-paren': ['warn', 'never'], // Change to warning
    'keyword-spacing': 'warn', // Change to warning
    'space-infix-ops': 'warn', // Change to warning
    'eol-last': 'warn', // Change to warning
    'no-trailing-spaces': 'warn', // Change to warning
    'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }], // Change to warning
    'brace-style': ['warn', '1tbs', { allowSingleLine: true }], // Change to warning
    'curly': ['warn', 'all'], // Change to warning
    'eqeqeq': ['warn', 'always'], // Change to warning
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'warn', // Change to warning
    'no-empty': 'warn', // Change to warning
    'no-extra-boolean-cast': 'warn', // Change to warning
    'no-extra-semi': 'warn', // Change to warning
    'no-regex-spaces': 'warn', // Change to warning
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
    // Common GAS function names that are defined across files
    'getMe_': 'readonly',
    'readRows_': 'readonly',
    'writeRow_': 'readonly',
    'updateOrInsert_': 'readonly',
    'updateOrInsertMany_': 'readonly',
    'deleteRowById_': 'readonly',
    'deleteRowsWhere_': 'readonly',
    'sheet_': 'readonly',
    'getHeaders_': 'readonly',
    'uid_': 'readonly',
    'getCurrentUserEmail': 'readonly',
    'verifyIdToken_': 'readonly',
    'ensureVisionSheet_': 'readonly',
    'ensureAdminSheets_': 'readonly',
    'SHEET_IDS': 'readonly',
    'DB_SHEET_NAME': 'readonly',
    'CLASSNAME': 'readonly',
    'MISSIONNAME': 'readonly',
    'USERNAME': 'readonly',
    'OAUTH_CLIENT_ID': 'readonly',
    'OPENAI_MODEL': 'readonly',
    'OPENAI_URL': 'readonly',
    'Classroom': 'readonly', // Google Classroom API
  },
};
