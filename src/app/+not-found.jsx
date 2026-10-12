import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text className="font-sans-bold text-2xl text-ink">This screen doesn&apos;t exist.</Text>
        <Link href="/">
          <Text className="font-sans-medium text-primary">Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}