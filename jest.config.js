/**
 * Jest config for the Expo app.
 *
 * Two projects, because the suites have very different needs:
 *
 *  - `logic` runs the pure modules (pricing, validators, mappers, orders,
 *    invoice calculation + HTML escaping, cart identity, Redux reducers) in a
 *    plain Node environment. No React Native transform, no emulator, no
 *    network. These are the tests that encode the business rules and the
 *    security invariants, and they run in ~a second.
 *
 *  - `native` runs component tests through the `jest-expo` preset, which
 *    supplies the React Native + Expo module mocks that rendering needs.
 *
 * Keeping them apart matters: a broken RN/Expo mock in the `native` project
 * cannot take the business-logic suite down with it, so a red build still
 * tells you which layer broke.
 */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/logic/**/*.test.js'],
      setupFiles: ['<rootDir>/__tests__/setup/env.js'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.[jt]sx?$': ['babel-jest', { presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]] }],
      },
      clearMocks: true,
    },
    {
      displayName: 'native',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/__tests__/native/**/*.test.js'],
      setupFiles: ['<rootDir>/__tests__/setup/env.js'],
      setupFilesAfterEnv: ['<rootDir>/__tests__/setup/native.js'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop|react-redux|@reduxjs/toolkit)',
      ],
      clearMocks: true,
    },
  ],
  collectCoverageFrom: [
    'src/utils/**/*.js',
    'src/services/**/*.js',
    'src/store/**/*.js',
    'src/lib/toast.js',
    'src/components/**/*.jsx',
    '!**/node_modules/**',
  ],
};