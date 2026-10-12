import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useDispatch } from 'react-redux';
import { setUser } from '@/store/UserSlice';

// Why-were-you-logged-out banner — set by sessionManager.forceLogout redirecting
// here with ?reason=..., ported from LoginPage.jsx's `sessionMsg`.
//
// `type` is the source's own discriminator, and it drives more than a colour:
// the two reasons get different glyphs and different token families —
// `session_conflict` is a warning (accent tokens + AlertTriangle), `no_session`
// merely informational (info tokens + Info). The earlier port collapsed both
// onto the warning palette with no icon, so an expired session read as
// alarmingly as being kicked off by another device.
function useSessionMessage() {
  const { reason } = useLocalSearchParams();
  if (reason === 'session_conflict') {
    return {
      type: 'warning',
      title: 'You were logged out',
      message:
        'Your account was accessed from another device. For your security, this session was ended. Please log in again.',
    };
  }
  if (reason === 'no_session') {
    return {
      type: 'info',
      title: 'Session expired',
      message: 'Your session has expired. Please log in again.',
    };
  }
  return null;
}

export default function LoginScreen() {
  const { login, requestPasswordReset } = useAuth();
  const c = useThemeColors();
  const sessionMessage = useSessionMessage();
  const router = useRouter();
  const dispatch = useDispatch();

  const [mode, setMode] = useState('login'); // "login" | "forgot"
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // No manual navigation needed — (auth)/_layout redirects to /products
      // reactively once Redux's user state updates.
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    if (!resetEmail) {
      setError('Please enter your email');
      return;
    }
    setResetSending(true);
    try {
      await requestPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setResetSending(false);
    }
  };

  const backToLogin = () => {
    setMode('login');
    setResetSent(false);
    setResetEmail('');
    setError('');
  };

  // Phase 8.3: anonymous guest sign-in
  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
      dispatch(setUser({
        uid: data.user.id,
        name: 'Guest',
        email: null,
        role: 'customer',
        is_anonymous: true,
      }));
      router.replace('/(app)/(tabs)/products');
    } catch (e) {
      setError(e.message || 'Guest sign-in failed. Please try again.');
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView className="flex-1">
        <ScrollView
          contentContainerClassName="p-6 gap-6"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {sessionMessage &&
          (() => {
            const isWarning = sessionMessage.type === 'warning';
            return (
              <View
                className={`flex-row items-start gap-3 rounded-xl border p-4 ${
                  isWarning
                    ? 'border-accent-subtle bg-accent-subtle'
                    : 'border-info-border bg-info-subtle'
                }`}>
                <View className="mt-0.5 flex-shrink-0">
                  <Icon
                    name={isWarning ? 'alert-triangle' : 'info'}
                    size={18}
                    color={isWarning ? c.accent : c.info}
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text
                    className={`font-sans-semibold text-sm ${
                      isWarning ? 'text-accent-strong' : 'text-info'
                    }`}>
                    {sessionMessage.title}
                  </Text>
                  <Text
                    className={`font-sans text-sm ${
                      isWarning ? 'text-accent-strong' : 'text-info'
                    }`}>
                    {sessionMessage.message}
                  </Text>
                </View>
              </View>
            );
          })()}

        {mode === 'login' ? (
          <>
            <View className="gap-1">
              <Text className="font-sans-bold text-3xl text-ink">Welcome back</Text>
              <Text className="font-sans text-sm text-muted">Sign in to continue to your account</Text>
            </View>

            <View className="gap-4">
              <View className="gap-1.5">
                <Text className="font-sans-medium text-xs uppercase tracking-wide text-muted">
                  Email
                </Text>
                <TextInput
                  className="rounded-xl bg-surface-muted p-3.5 font-sans text-sm text-ink"
                  placeholder="you@example.com"
                  placeholderTextColor={c.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View className="gap-1.5">
                <Text className="font-sans-medium text-xs uppercase tracking-wide text-muted">
                  Password
                </Text>
                <View className="flex-row items-center rounded-xl bg-surface-muted pr-3.5">
                  <TextInput
                    className="flex-1 p-3.5 font-sans text-sm text-ink"
                    placeholder="Enter your password"
                    placeholderTextColor={c.muted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    hitSlop={8}
                    className="active:opacity-60">
                    {/* Source: `showPw ? <EyeOff size={16}> : <Eye size={16}>`. */}
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} color={c.muted} />
                  </Pressable>
                </View>
                <Pressable onPress={() => setMode('forgot')} className="self-end active:opacity-60">
                  <Text className="font-sans-semibold text-xs text-primary">Forgot password?</Text>
                </Pressable>
              </View>

              {!!error && <Text className="font-sans text-sm text-error">{error}</Text>}

              <Pressable
                className="items-center rounded-full bg-primary p-3.5"
                disabled={loading}
                onPress={handleLogin}>
                {loading ? (
                  <ActivityIndicator color={c.inverse} />
                ) : (
                  <Text className="font-sans-bold text-base text-inverse">Sign In</Text>
                )}
              </Pressable>
            </View>

            <Text className="text-center font-sans text-sm text-muted">
              New here?{' '}
              <Link href="/signup">
                <Text className="font-sans-bold text-primary">Create an account</Text>
              </Link>
            </Text>
            {/* Phase 8.3: Guest checkout */}
            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Text className="font-sans text-xs text-muted">or</Text>
              <View className="h-px flex-1 bg-border" />
            </View>
            <Pressable
              className="items-center rounded-full border border-border-strong p-3.5"
              disabled={guestLoading || loading}
              onPress={handleGuestLogin}>
              {guestLoading ? (
                <ActivityIndicator color={c.muted} />
              ) : (
                <Text className="font-sans-semibold text-base text-body">Continue as Guest</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <View className="gap-1">
              <Text className="font-sans-bold text-3xl text-ink">Reset your password</Text>
              <Text className="font-sans text-sm text-muted">
                {resetSent
                  ? 'Check your inbox for the reset link.'
                  : "Enter your email and we'll send you a link to reset it."}
              </Text>
            </View>

            {resetSent ? (
              <Text className="text-center font-sans text-sm text-muted">
                Sent a password reset link to {resetEmail} if an account exists for that email.
              </Text>
            ) : (
              <View className="gap-4">
                <View className="gap-1.5">
                  <Text className="font-sans-medium text-xs uppercase tracking-wide text-muted">
                    Email
                  </Text>
                  <TextInput
                    className="rounded-xl bg-surface-muted p-3.5 font-sans text-sm text-ink"
                    placeholder="you@example.com"
                    placeholderTextColor={c.muted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                  />
                </View>

                {!!error && <Text className="font-sans text-sm text-error">{error}</Text>}

                <Pressable
                  className="items-center rounded-full bg-primary p-3.5"
                  disabled={resetSending}
                  onPress={handleForgotPassword}>
                  {resetSending ? (
                    <ActivityIndicator color={c.inverse} />
                  ) : (
                    <Text className="font-sans-bold text-base text-inverse">Send reset link</Text>
                  )}
                </Pressable>
              </View>
            )}

            <Pressable onPress={backToLogin}>
              <Text className="text-center font-sans-bold text-sm text-primary">Back to sign in</Text>
            </Pressable>
          </>
        )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}