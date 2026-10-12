import { Alert, Platform } from 'react-native';

/**
 * Yes/no confirmation that resolves to a boolean.
 *
 * `Alert.alert` is the native answer, but react-native-web implements it as a
 * no-op, so on the Expo web build a confirm built on it would silently never
 * appear (and the action behind it could never run). The browser's own
 * `window.confirm` stands in there.
 */
export function confirmAction({ title, message, confirmText = 'Delete' }) {
  if (Platform.OS === 'web') {
    const text = [title, message].filter(Boolean).join('\n\n');
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}