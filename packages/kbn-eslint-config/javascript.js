const RESTRICTED_GLOBALS = require('./restricted_globals');
const RESTRICTED_MODULES = { paths: ['gulp-util'] };

module.exports = {
  overrides: [
    /**
     * Main JS configuration
     */
    {
      files: ['**/*.js', '**/*.mjs'],
      parser: require.resolve('@babel/eslint-parser'),

      plugins: [
        'mocha',
        'import',
        'no-unsanitized',
      ],

      env: {
        es6: true,
        node: true,
        mocha: true,
        browser: true,
      },

      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2018,
        requireConfigFile: false,
        babelOptions: {
          presets: ['@kbn/babel-preset/node_preset'],
          parserOpts: {
            plugins: ['importAttributes']
          }
        },
      },

      rules: {
        camelcase: [ 'error', { properties: 'never', allow: ['^UNSAFE_'] } ],
        'consistent-return': 'off',
        'dot-notation': [ 'error', { allowKeywords: true } ],
        eqeqeq: [ 'error', 'allow-null' ],
        'new-cap': [ 'error', { capIsNewExceptions: [ 'Private' ] } ],
        'no-bitwise': 'off',
        'no-global-assign': 'error',
        'no-irregular-whitespace': 'error',
        'no-loop-func': 'error',
        'no-multi-str': 'off',
        'no-nested-ternary': 'error',
        'no-new': 'off',
        'no-path-concat': 'off',
        'no-proto': 'error',
        'no-redeclare': 'error',
        'no-restricted-globals': ['error', ...RESTRICTED_GLOBALS],
        'no-restricted-imports': [2, RESTRICTED_MODULES],
        'no-restricted-modules': [2, RESTRICTED_MODULES],
        'no-return-assign': 'off',
        'no-sequences': 'error',
        'no-shadow': 'off',
        'no-undef': 'error',
        'no-underscore-dangle': 'off',
        'no-unsanitized/method': 'error',
        'no-unsanitized/property': 'error',
        'no-unused-expressions': 'off',
        'no-unused-vars': [ 'error' ],
        'no-use-before-define': [ 'error', 'nofunc' ],
        'no-var': 'error',
        'one-var': [ 'error', 'never' ],
        'prefer-const': 'error',
        strict: [ 'error', 'never' ],
        'valid-typeof': 'error',
        yoda: 'off',

        'mocha/handle-done-callback': 'error',
        'mocha/no-exclusive-tests': 'error',

        'import/named': 'error',
        'import/namespace': 'error',
        'import/default': 'error',
        'import/export': 'error',
        'import/no-named-as-default': 'error',
        'import/no-named-as-default-member': 'error',
        'import/no-duplicates': 'error',
        'import/no-dynamic-require': 'error',

        'prefer-object-spread': 'error',
      }
    },
  ]
};
