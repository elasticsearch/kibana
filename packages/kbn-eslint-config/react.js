const semver = require('semver');
const { PKG_JSON } = require('@kbn/repo-info');

module.exports = {
  plugins: [
    'react',
    'react-hooks',
    'jsx-a11y',
  ],

  parserOptions: {
    ecmaFeatures: {
      jsx: true
    }
  },

  settings: {
    react: {
      version: semver.valid(semver.coerce(PKG_JSON.dependencies.react)),
    },
  },

  rules: {
    'react/jsx-uses-react': 'error',
    'react/react-in-jsx-scope': 'error',
    'react/jsx-uses-vars': 'error',
    'react/jsx-no-duplicate-props': ['error', { ignoreCase: true }],
    'react/no-danger': 'error',
    'react-hooks/rules-of-hooks': 'error', // Checks rules of Hooks
    'react-hooks/exhaustive-deps': 'error', // Checks effect dependencies
    'jsx-a11y/accessible-emoji': 'error',
    'jsx-a11y/click-events-have-key-events': 'error',
    'jsx-a11y/no-noninteractive-element-interactions': 'error',
    'jsx-a11y/role-has-required-aria-props': 'error',
    'jsx-a11y/role-supports-aria-props': 'error',
    'react/prefer-stateless-function': ['error', { ignorePureComponents: true }],
  },
}
