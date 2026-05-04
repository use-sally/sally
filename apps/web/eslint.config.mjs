import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  ...nextVitals,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    rules: {
      // React 19 compiler-oriented rules are too noisy for the current codebase.
      // Keep type-check/build green while dependency security updates ship first.
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default config
