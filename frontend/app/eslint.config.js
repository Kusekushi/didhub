import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['src/__tests__/login-redirect.test.tsx', 'src/__tests__/user-menu.test.tsx'],
        },
        tsconfigRootDir: import.meta.dirname,
        project: ['./tsconfig.json'],
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@typescript-eslint': tseslint.plugin,
      'react': react,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
   },
   {
     files: ['src/__tests__/**/*.tsx', 'src/__tests__/**/*.ts', 'src/test/**/*.ts', 'src/test/**/*.tsx'],
     rules: {
       "@typescript-eslint/no-unsafe-argument": "off",
       "@typescript-eslint/no-unsafe-assignment": "off",
       "@typescript-eslint/no-unsafe-call": "off",
       "@typescript-eslint/no-unsafe-member-access": "off",
       "@typescript-eslint/no-base-to-string": "off",
       "@typescript-eslint/require-await": "off",
     },
   },
 )
