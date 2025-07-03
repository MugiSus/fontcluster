// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import solid from 'eslint-plugin-solid/configs/typescript'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import tailwindcss from 'eslint-plugin-tailwindcss'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    ...solid,
    plugins: {
      ...solid.plugins,
      prettier: prettierPlugin,
      tailwindcss,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      ...solid.rules,
      'prettier/prettier': 'error',
      'tailwindcss/no-custom-classname': 'error',
      'tailwindcss/classnames-order': 'error',
    },
  },
  prettierConfig,
)