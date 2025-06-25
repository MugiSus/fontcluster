// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import solid from 'eslint-plugin-solid/configs/typescript'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    ...solid,
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.json',
      },
    },
  },
)