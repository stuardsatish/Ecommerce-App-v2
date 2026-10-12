import { Redirect, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';

export default function AppLayout() {
    const user = useSelector((state) => state.user.user);
    const { logout } = useAuth();

    if (!user) {
        return <Redirect href="/login" />;
    }

    if (user.role === 'admin') {
        return (
            <View className="flex-1 bg-background">
                <SafeAreaView className="flex-1 items-center justify-center gap-3 p-6">
                    <Text className="text-center font-sans-semibold text-xl text-ink">
                        Admin accounts aren&apos;t supported here
                    </Text>
                    <Text className="text-center font-sans text-sm text-muted">
                        This app is for customer accounts only (Unclear Item 4, resolved: admin logins are
                        rejected). Please use the admin dashboard on the web instead.
                    </Text>
                    <Pressable
                        className="rounded-xl border border-border p-4 active:bg-surface-muted"
                        onPress={() => logout(user.uid)}>
                        <Text className="font-sans-medium text-link">Log out</Text>
                    </Pressable>
                </SafeAreaView>
            </View>
        );
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}