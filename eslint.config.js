// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import tailwindcss from 'eslint-plugin-tailwindcss';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tailwindcss.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    ...solid,
    plugins: {
      ...solid.plugins,
      'prettier': prettierPlugin,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      ...solid.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['variable', 'typeProperty'],
          types: ['boolean'],
          format: ['StrictPascalCase'],
          prefix: ['is', 'should', 'has', 'can', 'did', 'will', 'show'],
        },
      ],
    },
  },
  {
    // Vendored solid-ui / kobalte primitives mirror upstream boolean prop
    // names (inset, open, disabled, ...) and can't follow our convention.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  prettierConfig,
);
