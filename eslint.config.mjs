import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import stylistic from '@stylistic/eslint-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: [
      'next/core-web-vitals',
      'next/typescript',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_$',
          varsIgnorePattern: '^_$',
        },
      ],
      'prefer-rest-params': 'off',
    },
  }),
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/no-extra-parens': [
        'error',
        'all',
      ],
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/array-bracket-newline': [
        'error',
        {
          minItems: 2,
        },
      ],
      '@stylistic/array-bracket-spacing': [
        'error',
        'always',
      ],
      '@stylistic/array-element-newline': [
        'error',
        {
          minItems: 2,
        },
      ],
      '@stylistic/arrow-parens': [
        'error',
        'as-needed',
      ],
      '@stylistic/arrow-spacing': 'error',
      '@stylistic/block-spacing': 'error',
      '@stylistic/brace-style': 'error',
      '@stylistic/comma-dangle': [
        'error',
        {
          arrays: 'always',
          objects: 'always',
        },
      ],
      '@stylistic/comma-style': 'error',
      '@stylistic/dot-location': [
        'error',
        'property',
      ],
      '@stylistic/eol-last': 'error',
      '@stylistic/function-call-spacing': 'error',
      '@stylistic/function-paren-newline': [
        'error',
        'multiline-arguments',
      ],
      '@stylistic/indent': [
        'error',
        2,
      ],
      '@stylistic/jsx-quotes': [
        'error',
        'prefer-single',
      ],
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      // '@stylistic/line-comment-position': 'error',
      '@stylistic/linebreak-style': 'error',
      '@stylistic/lines-around-comment': 'error',

      /*
       * '@stylistic/max-len': [ 'error', {
       *   code: 100,
       *   tabWidth: 2,
       *   ignoreUrls: true,
       *   ignoreStrings: true,
       *   ignoreTemplateLiterals: true,
       * } ],
       */
      '@stylistic/max-statements-per-line': 'error',
      '@stylistic/multiline-comment-style': 'error',
      '@stylistic/multiline-ternary': [
        'error',
        'always-multiline',
      ],
      '@stylistic/new-parens': 'error',
      '@stylistic/newline-per-chained-call': 'error',
      '@stylistic/no-extra-parens': [
        'error',
        'all',
        {
          nestedBinaryExpressions: false,
        },
      ],
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/no-mixed-operators': 'error',
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': [
        'error',
        { max: 1, },
      ],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-whitespace-before-property': 'error',
      '@stylistic/nonblock-statement-body-position': 'error',
      '@stylistic/object-curly-newline': [
        'error',
        {
          minProperties: 2,
          consistent: true,
        },
      ],
      '@stylistic/object-curly-spacing': [
        'error',
        'always',
      ],
      '@stylistic/one-var-declaration-per-line': 'error',
      '@stylistic/operator-linebreak': 'error',
      '@stylistic/quotes': [
        'error',
        'single',
      ],
      '@stylistic/rest-spread-spacing': 'error',
      '@stylistic/semi': 'error',
      '@stylistic/semi-spacing': 'error',
      '@stylistic/semi-style': 'error',
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      '@stylistic/space-in-parens': 'error',
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/space-unary-ops': 'error',
      '@stylistic/spaced-comment': 'error',
      '@stylistic/switch-colon-spacing': 'error',
      '@stylistic/template-curly-spacing': 'error',
      '@stylistic/type-annotation-spacing': 'error',
      '@stylistic/wrap-iife': [
        'error',
        'inside',
      ],
      '@stylistic/wrap-regex': 'error',
    },
  },
];

export default eslintConfig;
