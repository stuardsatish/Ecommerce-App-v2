/**
 * Mocks for the native modules the component suite touches. Each one is here
 * because it has no JS-only implementation and would throw on import in Node.
 */
// (No `@testing-library/react-native/extend-expect` import: from RNTL 13 the
// jest matchers register themselves when the library is first imported.)

// NOTE: the factories below load React with `jest.requireActual('react')`, not
// `require('react')`. The nativewind Babel plugin rewrites `React.createElement`
// into a reference to a hoisted import when React came from `require('react')`,
// and jest.mock() factories may not reference out-of-scope variables - the whole
// suite then fails to even start.

// Vector icons render as a host component whose name is the glyph, so a test
// can assert WHICH icon rendered rather than just that something did.
jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const makeSet = (setName) => {
    const C = ({ name, size, color, ...rest }) =>
      React.createElement('Icon', { testID: `icon-${setName}-${name}`, size, color, ...rest });
    C.displayName = setName;
    return C;
  };
  return {
    Feather: makeSet('Feather'),
    Ionicons: makeSet('Ionicons'),
    MaterialCommunityIcons: makeSet('MaterialCommunityIcons'),
  };
});

jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: jest.fn() }),
  cssInterop: jest.fn(),
  remapProps: jest.fn(),
}));

jest.mock('expo-image', () => {
  const React = jest.requireActual('react');
  return { Image: (props) => React.createElement('ExpoImage', props) };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Link: ({ children }) => children,
  Stack: () => null,
  Redirect: () => null,
}));

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/i.pdf' })) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

// Reanimated ships its own Jest mock; the worklets runtime does not exist in Node.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Silence the Animated-driver noise RN emits under the test renderer, but let
// everything else through — Icon.jsx intentionally console.warns on an unknown
// name and a test asserts on it, so this must not swallow warnings wholesale.
// `originalWarn` is captured BEFORE the spy replaces console.warn; reading it
// inside the implementation without capturing first would recurse.
const originalWarn = console.warn.bind(console);
jest.spyOn(console, 'warn').mockImplementation((...args) => {
  const msg = String(args[0] ?? '');
  if (msg.includes('useNativeDriver') || msg.includes('Animated:')) return;
  originalWarn(...args);
});