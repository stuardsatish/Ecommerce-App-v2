import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as rnColorScheme } from 'nativewind';
import { Appearance } from 'react-native';

/**
 * Manual dark/light override, layered on top of NativeWind's `darkMode:
 * 'class'` setup (see tailwind.config.js + global.css's `.dark:root` block).
 *
 * NativeWind's `setColorScheme` only ever toggles a "dark" class/flag — it
 * has no built-in "follow the OS until the user picks a mode" behavior (that
 * story, unlike `darkMode: 'media'`, is left to the app). This mirrors the
 * source web app's ThemeContext.jsx: default to `Appearance.getColorScheme()`,
 * keep following OS changes, until the user explicitly pins a mode via the
 * header's Dark Mode toggle — then persist that pin so it survives reloads.
 */
const STORAGE_KEY = 'app-color-scheme';

let pinned = false;
let appearanceSubscription = null;

export async function initColorScheme() {
  const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);

  if (stored === 'light' || stored === 'dark') {
    pinned = true;
    rnColorScheme.set(stored);
  } else {
    pinned = false;
    rnColorScheme.set(Appearance.getColorScheme() ?? 'light');
  }

  appearanceSubscription?.remove();
  appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
    if (!pinned) rnColorScheme.set(colorScheme ?? 'light');
  });
}

/** Called by the header's Dark Mode toggle — pins the choice and persists it. */
export async function pinColorScheme(value) {
  pinned = true;
  rnColorScheme.set(value);
  await AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
}