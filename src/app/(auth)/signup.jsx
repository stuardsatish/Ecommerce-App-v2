import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Link, router } from 'expo-router';
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
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { isValidEmail, isValidSignupPassword, passwordsMatch } from '@/utils/validators';
import { useDispatch } from 'react-redux';
import { setUser } from '@/store/UserSlice';

/** Source SignupPage's `<select name="gender">` options, minus its empty "Select…". */
const GENDERS = ['Male', 'Female', 'Prefer not to say'];

const formatDateShort = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Ported from SignupPage.jsx (no mobile/desktop split — one responsive
 * layout), including all three of its sections: the required **Account**
 * fields, and the optional **Personal Details** and **Delivery Address**
 * groups. An earlier pass shipped the Account section only and let the rest
 * default to blank, on the reasoning that Profile can edit them later; that
 * was wrong in a way worth naming, because `signup()` already forwarded those
 * keys — so the fields weren't merely missing from the form, anything the
 * source collects here was being written as empty strings into a profile row
 * the `on_auth_user_created` trigger creates once, at signup.
 *
 * Section labels and every field label/placeholder are the source's. The
 * two-up rows (Phone|Gender, City|State) mirror its
 * `grid-cols-1 sm:grid-cols-2`; with one narrow form factor there's no
 * breakpoint to switch on, so they stay side by side.
 *
 * Two controls have no RN primitive and reuse EditProfileSheet's established
 * substitutes for these same two source inputs: Gender's `<select>` becomes a
 * row of pills (three options — a picker would weigh more than the choice),
 * and Date of Birth's `<input type="date">` becomes
 * `@react-native-community/datetimepicker` (imperative dialog on Android,
 * inline spinner on iOS).
 *
 * Validation is unchanged — the source validates only the Account fields, so
 * both optional groups can be left entirely empty, exactly as on web.
 */
export default function SignupScreen() {
  const { signup } = useAuth();
  const c = useThemeColors();
  const dispatch = useDispatch();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);

  // Phase 8.3: anonymous guest sign-in
  const handleGuestLogin = async () => {
    setGuestLoading(true);
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
      toast.error(e.message || 'Guest sign-in failed. Please try again.');
    } finally {
      setGuestLoading(false);
    }
  };

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Source's handleChange clears a field's error as soon as it's edited.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const openDatePicker = () => {
    const current = form.dateOfBirth ? new Date(form.dateOfBirth) : new Date(2000, 0, 1);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        maximumDate: new Date(),
        onChange: (_event, date) => {
          if (date) setForm((f) => ({ ...f, dateOfBirth: date.toISOString().slice(0, 10) }));
        },
      });
    } else {
      setShowIosDatePicker(true);
    }
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Full name is required';
    if (!form.email) next.email = 'Email is required';
    else if (!isValidEmail(form.email)) next.email = 'Invalid email format';
    if (!form.password) next.password = 'Password is required';
    else if (!isValidSignupPassword(form.password))
      next.password = 'Min 8 characters, with at least one letter and one number';
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password';
    else if (!passwordsMatch(form.password, form.confirmPassword))
      next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setLoading(true);
    try {
      await signup({
        name: form.name,
        email: form.email.trim(),
        password: form.password,
        phone: form.phone,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        street: form.street,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      });
      toast.success('Account created — check your inbox to verify your email before checking out.');
      router.replace('/login');
    } catch (e) {
      setErrors({ form: e.message });
      toast.error(e.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (key) =>
    errors[key] ? <Text className="font-sans text-xs text-error">{errors[key]}</Text> : null;

  const sectionLabel = (title, optional) => (
    <Text className="mt-2 font-sans-semibold text-xs uppercase tracking-wide text-ink">
      {title}
      {optional ? (
        <Text className="font-sans-medium text-xs normal-case tracking-normal text-muted">
          {' (optional)'}
        </Text>
      ) : null}
    </Text>
  );

  const label = (text) => (
    <Text className="font-sans-medium text-xs uppercase tracking-wide text-muted">{text}</Text>
  );

  const input = (key, props = {}) => (
    <TextInput
      className="rounded-xl bg-surface-muted p-3.5 font-sans text-sm text-ink"
      placeholderTextColor={c.muted}
      value={form[key]}
      onChangeText={set(key)}
      {...props}
    />
  );

  /** Password field with the source's eye / eye-off reveal toggle. */
  const passwordField = (key, placeholder, shown, setShown) => (
    <View className="flex-row items-center rounded-xl bg-surface-muted pr-3.5">
      <TextInput
        className="flex-1 p-3.5 font-sans text-sm text-ink"
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        value={form[key]}
        onChangeText={set(key)}
      />
      <Pressable
        onPress={() => setShown((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
        hitSlop={8}
        className="active:opacity-60">
        <Icon name={shown ? 'eye-off' : 'eye'} size={16} color={c.muted} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView className="flex-1">
        <ScrollView
          contentContainerClassName="gap-6 p-6"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View className="gap-1">
            <Text className="font-sans-bold text-3xl text-ink">Create account</Text>
            <Text className="font-sans text-sm text-muted">Set up your profile to get started</Text>
          </View>

          <View className="gap-4">
            {/* ── Account ── */}
            {sectionLabel('Account')}

            <View className="gap-1.5">
              {label('Full Name')}
              {input('name', { placeholder: 'Your full name' })}
              {fieldError('name')}
            </View>

            <View className="gap-1.5">
              {label('Email')}
              {input('email', {
                placeholder: 'you@example.com',
                autoCapitalize: 'none',
                autoCorrect: false,
                keyboardType: 'email-address',
              })}
              {fieldError('email')}
            </View>

            <View className="gap-1.5">
              {label('Password')}
              {passwordField(
                'password',
                'Min 8 characters, 1 letter + 1 number',
                showPassword,
                setShowPassword
              )}
              {fieldError('password')}
            </View>

            <View className="gap-1.5">
              {label('Confirm Password')}
              {passwordField('confirmPassword', 'Re-enter password', showConfirm, setShowConfirm)}
              {fieldError('confirmPassword')}
            </View>

            {/* ── Personal Details (optional) ── */}
            {sectionLabel('Personal Details', true)}

            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                {label('Phone')}
                {input('phone', { placeholder: 'Phone number', keyboardType: 'phone-pad' })}
              </View>
              <View className="flex-1 gap-1.5">
                {label('Gender')}
                <View className="flex-row flex-wrap gap-2">
                  {GENDERS.map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => set('gender')(form.gender === g ? '' : g)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: form.gender === g }}
                      className={`rounded-full border px-3 py-2 active:opacity-70 ${
                        form.gender === g ? 'border-ink bg-ink' : 'border-border'
                      }`}>
                      <Text
                        className={`font-sans-semibold text-xs ${
                          form.gender === g ? 'text-inverse' : 'text-body'
                        }`}>
                        {g}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View className="gap-1.5">
              {label('Date of Birth')}
              <Pressable
                onPress={openDatePicker}
                accessibilityRole="button"
                className="rounded-xl bg-surface-muted p-3.5 active:opacity-70">
                <Text
                  className={
                    form.dateOfBirth ? 'font-sans text-sm text-ink' : 'font-sans text-sm text-muted'
                  }>
                  {form.dateOfBirth ? formatDateShort(form.dateOfBirth) : 'Select date'}
                </Text>
              </Pressable>
              {Platform.OS === 'ios' && showIosDatePicker ? (
                <View className="rounded-xl bg-surface-muted p-2">
                  <DateTimePicker
                    value={form.dateOfBirth ? new Date(form.dateOfBirth) : new Date(2000, 0, 1)}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    onChange={(_event, date) => {
                      if (date)
                        setForm((f) => ({ ...f, dateOfBirth: date.toISOString().slice(0, 10) }));
                    }}
                  />
                  <Pressable
                    onPress={() => setShowIosDatePicker(false)}
                    className="items-center py-2 active:opacity-60">
                    <Text className="font-sans-semibold text-sm text-primary">Done</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* ── Delivery Address (optional) ── */}
            {sectionLabel('Delivery Address', true)}

            <View className="gap-1.5">
              {label('Street')}
              {input('street', { placeholder: 'Street address' })}
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                {label('City')}
                {input('city', { placeholder: 'City' })}
              </View>
              <View className="flex-1 gap-1.5">
                {label('State')}
                {input('state', { placeholder: 'State' })}
              </View>
            </View>

            <View className="gap-1.5">
              {label('Pincode')}
              {input('pincode', { placeholder: 'Pincode', keyboardType: 'number-pad' })}
            </View>

            {!!errors.form && <Text className="font-sans text-sm text-error">{errors.form}</Text>}

            <Pressable
              className="mt-2 items-center rounded-full bg-primary p-3.5 active:opacity-90"
              disabled={loading}
              onPress={handleSignup}
              style={{
                // Source: `0px 4px 6px -4px` of primary@20%.
                shadowColor: c.primary,
                shadowOpacity: 0.2,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
                opacity: loading ? 0.85 : 1,
              }}>
              {loading ? (
                <ActivityIndicator color={c.inverse} />
              ) : (
                <Text className="font-sans-bold text-base text-inverse">Create Account</Text>
              )}
            </Pressable>
          </View>

          <Text className="text-center font-sans text-sm text-muted">
            Already have an account?{' '}
            <Link href="/login">
              <Text className="font-sans-bold text-primary">Sign in</Text>
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
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}