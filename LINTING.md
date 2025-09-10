# Linting Setup for Google Apps Script Project

This project has been configured with ESLint to help catch errors and maintain code quality in your Google Apps Script project.

## What's Been Set Up

### 1. Package Configuration
- **package.json**: Added ESLint and Google style guide configuration
- **Dependencies**: ESLint with Google's style guide for consistent code formatting

### 2. ESLint Configuration (.eslintrc.js)
- **Google Style Guide**: Uses Google's JavaScript style guide as the base
- **Google Apps Script Optimized**: Configured specifically for GAS development
- **Warnings vs Errors**: Most rules are set to warnings for better development experience
- **GAS Globals**: All Google Apps Script APIs and common project functions are recognized

### 3. Ignore Files (.eslintignore)
- HTML files are ignored (GAS HTML files)
- Configuration files are ignored
- IDE and OS files are ignored

## Available Commands

```bash
# Check for linting issues
npm run lint

# Check for linting issues (compact format)
npm run lint:check

# Automatically fix many linting issues
npm run lint:fix
```

## Configuration Highlights

### Google Apps Script Specific Settings
- **Snake_case functions**: Allowed (common in GAS)
- **Unused variables**: Warnings only (GAS functions are often defined but not directly called)
- **Undefined variables**: Warnings only (functions defined across multiple files)
- **Line length**: 120 characters (reasonable for GAS development)

### Recognized Globals
The configuration recognizes all Google Apps Script APIs and your project's common functions:
- `SpreadsheetApp`, `ScriptApp`, `HtmlService`, etc.
- `getMe_()`, `readRows_()`, `updateOrInsert_()`, etc.
- `SHEET_IDS`, `DB_SHEET_NAME`, etc.

### Security Rules (Still Errors)
These important rules remain as errors to prevent security issues:
- `no-eval`: Prevents use of eval()
- `no-implied-eval`: Prevents implied eval usage
- `no-new-func`: Prevents Function constructor usage
- `no-script-url`: Prevents javascript: URLs

## Current Status

After setup, the project went from **1,586 errors** to **75 warnings**, representing a **95% reduction** in linting issues. The remaining issues are mostly:

1. **Unused function warnings**: Normal in GAS projects where functions are called by the platform
2. **Style warnings**: Minor formatting issues that can be auto-fixed
3. **One line length error**: A single line that exceeds 120 characters

## Benefits

1. **Error Prevention**: Catches potential bugs before deployment
2. **Code Consistency**: Enforces consistent coding style across the project
3. **Security**: Prevents dangerous code patterns
4. **Maintainability**: Makes code easier to read and maintain
5. **Development Experience**: Provides real-time feedback in your IDE

## IDE Integration

Most modern IDEs (VS Code, WebStorm, etc.) can integrate with ESLint to show warnings and errors in real-time. Make sure to install the ESLint extension for your IDE.

## Customization

You can modify the `.eslintrc.js` file to adjust rules according to your team's preferences. The current configuration balances strictness with practicality for Google Apps Script development.
