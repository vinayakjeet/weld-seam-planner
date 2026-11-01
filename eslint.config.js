import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/core must stay free of React.' },
            { group: ['@react-three/*'], message: 'src/core must stay free of react-three.' },
            {
              group: ['three/examples/*', 'three/examples/**', 'three/addons/*', 'three/addons/**', 'three/webgpu'],
              message: 'src/core must not import three renderers or addons.',
            },
            { group: ['**/ui', '**/ui/**'], message: 'src/core must not import from src/ui.' },
          ],
        },
      ],
    },
  },
)
