import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { toast } from '@/lib/toast';

/**
 * Landed on via the deep link from supabase.auth.resetPasswordForEmail
 * (redirectTo: Linking.createURL('reset-password'), see useAuth.js).
 *
 * The web app relies on Supabase's `detectSessionInUrl` to auto-parse the
 * recovery token from the URL fragment — there's no fragment/URL-bar concept
 * in RN, so this screen parses Expo Router's own query params instead and
 * establishes the recovery session explicitly. Handles BOTH param shapes
 * Supabase's email templates can produce (token_hash+type, or the older
 * access_token+refresh_token pair) since which one this project's email
 * template actually sends can't be confirmed without triggering a real
 * reset email — see Unclear Item 10 in MIGRATION_ANALYSIS.md. You'll also
 * need to add this app's redirect URL to Supabase Auth's allowed redirect
 * list on the dashboard before this can work end-to-end.
 */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams();
  const { updatePassword } = useAuth();
  const c = useThemeColors();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Source keeps a SINGLE `showPw`: the reveal button sits on the New-password
  // field only, but both inputs read it, so one tap reveals the pair. Ported
  // as-is rather than giving each field its own toggle.
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const establishSession = async () => {
      const { token_hash, type, access_token, refresh_token } = params;

      if (token_hash && type) {
        // `type` is pinned to 'recovery' rather than forwarded from the link.
        // Both values arrive from a deep link anyone can craft and hand to
        // this app (scheme `ecommerceapp://`), and verifyOtp's `type` selects
        // which token class is being redeemed — so passing it through let an
        // externally supplied link redeem e.g. an `email_change` or `invite`
        // token on this screen and land the resulting session on a form whose
        // only action is "set a new password". This screen exists for exactly
        // one flow, so it accepts exactly that one type.
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: String(token_hash),
          type: 'recovery',
        });
        if (!active) return;
        setHasSession(!verifyError);
        setReady(true);
        return;
      }

      if (access_token && refresh_token) {
        const { error: setError_ } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!active) return;
        setHasSession(!setError_);
        setReady(true);
        return;
      }

      // No recovery params — fall back to checking for an already-established session.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setHasSession(!!data.session);
      setReady(true);
    };

    establishSession();
    return () => {
      active = false;
    };
    // Intentionally depend on the individual param fields, not `params` itself —
    // useLocalSearchParams returns a new object identity most renders, which
    // would re-run this (and re-call verifyOtp/setSession) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token_hash, params.type, params.access_token, params.refresh_token]);

  const handleSubmit = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      // Source confirms with `toast.success("Password updated. Please log in.")`.
      // Without it this screen just vanished into /login with no sign the
      // change took. The two validation failures above stay inline rather than
      // becoming toasts — that's the pattern every other auth screen here uses
      // for field validation, and it keeps the message on screen while the user
      // fixes the field.
      toast.success('Password updated. Please log in.');
      router.replace('/login');
    } catch (e) {
      setError(e?.message || 'Could not update password. Please try again.');
    } finally {
      setSaving(false);
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
          <View className="gap-1">
            <Text className="font-sans-bold text-3xl text-ink">Set a new password</Text>
            <Text className="font-sans text-sm text-muted">Choose a new password for your account.</Text>
          </View>

          {!ready ? (
            <Text className="text-center font-sans text-sm text-muted">Verifying reset link…</Text>
          ) : !hasSession ? (
            <Text className="text-center font-sans text-sm text-muted">
              This reset link is invalid or has expired. Please request a new one from the login
              screen.
            </Text>
          ) : (
            <View className="gap-4">
              <View className="gap-1.5">
                <Text className="font-sans-medium text-xs uppercase tracking-wide text-muted">
                  New password
                </Text>
                <View className="flex-row items-center rounded-xl bg-surface-muted pr-3.5">
                  <TextInput
                    className="flex-1 p-3.5 font-sans text-sm text-ink"
                    placeholder="At least 8 characters"
                    placeholderTextColor={c.muted}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable
                    onPress={() => setShowPw((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle password visibility"
                    hitSlop={8}
                    className="active:opacity-60">
                    {/* Source: `showPw ? <EyeOff size={16}> : <Eye size={16}>` in muted. */}
                    <Icon name={showPw ? 'eye-off' : 'eye'} size={16} color={c.muted} />
                  </Pressable>
                </View>
              </View>
              <View className="gap-1.5">
                <Text className="font-sans-medium text-xs uppercase tracking-wide text-muted">
                  Confirm password
                </Text>
                <TextInput
                  className="rounded-xl bg-surface-muted p-3.5 font-sans text-sm text-ink"
                  placeholder="Re-enter password"
                  placeholderTextColor={c.muted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={confirm}
                  onChangeText={setConfirm}
                />
              </View>

              {!!error && <Text className="font-sans text-sm text-error">{error}</Text>}

              <Pressable
                className="items-center rounded-full bg-primary p-3.5"
                disabled={saving}
                onPress={handleSubmit}>
                {saving ? (
                  <ActivityIndicator color={c.inverse} />
                ) : (
                  <Text className="font-sans-bold text-base text-inverse">Update password</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}