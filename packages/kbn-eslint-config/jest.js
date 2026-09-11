module.exports = {
  overrides: [
    {
      files: [
        '**/*.{test,test.mocks,mock}.{js,mjs,ts,tsx}',
        '**/__mocks__/**/*.{js,mjs,ts,tsx}',
      ],
      plugins: [
        'jest',
      ],

      env: {
        'jest': true,
      },

      rules: {
        'jest/no-identical-title': 'error',
        'import/order': 'off',
      },
    }
  ]
};
