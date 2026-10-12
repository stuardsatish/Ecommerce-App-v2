import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const GENDERS = ['Male', 'Female', 'Prefer not to say'];

const formatDateShort = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Ported from MyProfile.jsx's `editModal` — the source uses ONE shared
 * modal with an internal Personal-Info/Change-Password tab switch (not two
 * separate modals — MIGRATION_ANALYSIS.md's Phase 15 file list names
 * `EditProfileSheet.tsx` + `ChangePasswordModal.tsx` as if they were
 * separate, but re-reading the actual source shows both the "Edit" pencil
 * and the "Change" password link open the exact same modal, just defaulting
 * to a different starting tab, and the user can flip between tabs without
 * closing it. Splitting it into two separate modals would lose that — kept
 * as one component, matching actual source behavior over the doc's guess.
 *
 * Gender's web `<select>` becomes a row of selectable pills (no native
 * picker needed for 3 options). Date of Birth's web `<input type="date">`
 * becomes `@react-native-community/datetimepicker` — Android opens an
 * imperative native dialog, iOS renders an inline spinner (platform-
 * appropriate UX, not a behavior change).
 *
 * Phase 16: wrapped in KeyboardAvoidingView — the password tab's fields sit
 * near the bottom of the sheet, where the keyboard would otherwise cover them.
 *
 * The delivery address is NOT edited here (roadmap task 4.2): it lives in the
 * address book, and `profiles.address` is the mirror of its default entry.
 */
export function EditProfileSheet({ visible, initialTab, onClose, profile, authUser, onSaved }) {
  const c = useThemeColors();
  const [activeTab, setActiveTab] = useState(initialTab || 'personal');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
  });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwErrors, setPwErrors] = useState({});
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm({
      name: profile?.name || authUser?.user_metadata?.name || '',
      phone: profile?.phone || '',
      gender: profile?.gender || '',
      dateOfBirth: profile?.date_of_birth || '',
    });
    setActiveTab(initialTab || 'personal');
    setModalError('');
    setPwErrors({});
    setPwForm({ current: '', next: '', confirm: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

  const handleSavePersonal = async () => {
    if (!authUser) return;
    try {
      setSaving(true);
      setModalError('');
      // No `address` here on purpose: it is the default address mirrored from
      // the address book by a database trigger, and writing it from this form
      // would overwrite that with stale text.
      const updates = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        date_of_birth: form.dateOfBirth || null,
      };
      const { data: updated, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', authUser.id)
        .select()
        .single();
      if (error) throw error;
      onSaved(updated);
      onClose();
      // Source: MyProfile's save handler — `showToast("Profile updated
      // successfully")`. Raised after onClose so the sheet is gone first (see
      // lib/toast.js's note on iOS Modal windows covering the toast).
      toast.success('Profile updated successfully');
    } catch (err) {
      console.error('Save profile error:', err);
      setModalError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!authUser) return;
    const errs = {};
    if (!pwForm.current) errs.current = 'Enter your current password';
    if (pwForm.next.length < 8) errs.next = 'Minimum 8 characters';
    if (pwForm.next !== pwForm.confirm) errs.confirm = 'Passwords do not match';
    setPwErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      setSaving(true);
      setModalError('');
      // Supabase has no dedicated reauthenticate call — verify the current
      // password by signing in with it before applying the change.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: authUser.email,
        password: pwForm.current,
      });
      if (verifyErr) {
        setPwErrors({ current: 'Current password is incorrect' });
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
      if (updateErr) throw updateErr;
      setPwForm({ current: '', next: '', confirm: '' });
      onClose();
      toast.success('Password updated successfully'); // source: MyProfile's showToast
    } catch (err) {
      console.error('Change password error:', err);
      setModalError(err.message || 'Failed to change password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (!saving) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeModal}>
      <Pressable className="flex-1 bg-overlay" onPress={closeModal} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="max-h-[92%] rounded-t-2xl bg-surface p-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-sans-bold text-lg text-ink">Edit Profile</Text>
          <Pressable
            onPress={closeModal}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            className="active:opacity-60">
            <Icon name="x" size={20} color={c.muted} />
          </Pressable>
        </View>

        <View className="mb-5 flex-row gap-1 rounded-full bg-surface-muted p-1">
          {[
            { key: 'personal', label: 'Personal Info' },
            { key: 'password', label: 'Change Password' },
          ].map((t) => (
            <Pressable
              key={t.key}
              onPress={() => {
                setActiveTab(t.key);
                setModalError('');
              }}
              className={`flex-1 items-center rounded-full py-2 ${
                activeTab === t.key ? 'bg-surface shadow-card' : ''
              }`}>
              <Text
                className={`font-sans-semibold text-[13px] ${
                  activeTab === t.key ? 'text-ink' : 'text-muted'
                }`}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView>
          {activeTab === 'personal' ? (
            <View className="gap-3.5">
              <View className="gap-1.5">
                <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">
                  Full Name
                </Text>
                <TextInput
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="Your name"
                  placeholderTextColor={c.muted}
                  className="rounded-xl bg-surface-muted px-4 py-3 font-sans text-sm text-ink"
                />
              </View>
              <View className="gap-1.5">
                <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">
                  Phone
                </Text>
                <TextInput
                  value={form.phone}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  placeholder="Phone number"
                  placeholderTextColor={c.muted}
                  keyboardType="phone-pad"
                  className="rounded-xl bg-surface-muted px-4 py-3 font-sans text-sm text-ink"
                />
              </View>

              <View className="gap-1.5">
                <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">
                  Gender
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {GENDERS.map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setForm({ ...form, gender: g })}
                      className={`rounded-full border px-3.5 py-2 ${
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

              <View className="gap-1.5">
                <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">
                  Date of Birth
                </Text>
                <Pressable
                  onPress={openDatePicker}
                  className="rounded-xl bg-surface-muted px-4 py-3">
                  <Text className={form.dateOfBirth ? 'font-sans text-sm text-ink' : 'font-sans text-sm text-muted'}>
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
                        if (date) setForm((f) => ({ ...f, dateOfBirth: date.toISOString().slice(0, 10) }));
                      }}
                    />
                    <Pressable onPress={() => setShowIosDatePicker(false)} className="items-center py-2">
                      <Text className="font-sans-semibold text-sm text-primary">Done</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="gap-3.5">
              {[
                { key: 'current', label: 'Current Password' },
                { key: 'next', label: 'New Password' },
                { key: 'confirm', label: 'Confirm New Password' },
              ].map((f) => (
                <View key={f.key} className="gap-1.5">
                  <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">
                    {f.label}
                  </Text>
                  <View className="flex-row items-center rounded-xl bg-surface-muted px-4">
                    <TextInput
                      value={pwForm[f.key]}
                      onChangeText={(v) => {
                        setPwForm({ ...pwForm, [f.key]: v });
                        setPwErrors({ ...pwErrors, [f.key]: '' });
                      }}
                      secureTextEntry={!pwShow[f.key]}
                      className="flex-1 py-3 font-sans text-sm text-ink"
                    />
                    <Pressable
                      onPress={() => setPwShow({ ...pwShow, [f.key]: !pwShow[f.key] })}
                      accessibilityRole="button"
                      accessibilityLabel={pwShow[f.key] ? 'Hide password' : 'Show password'}
                      hitSlop={8}
                      className="active:opacity-60">
                      {/* Source: `pwShow[f.key] ? <EyeOff size={16}> : <Eye size={16}>`. */}
                      <Icon name={pwShow[f.key] ? 'eye-off' : 'eye'} size={16} color={c.muted} />
                    </Pressable>
                  </View>
                  {pwErrors[f.key] ? (
                    <Text className="font-sans-medium text-xs text-error">{pwErrors[f.key]}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {modalError ? (
            <Text className="mt-3.5 font-sans-medium text-xs text-error">{modalError}</Text>
          ) : null}

          <View className="mt-6 flex-row items-center justify-end gap-3 pb-2">
            <Pressable
              onPress={closeModal}
              disabled={saving}
              className="rounded-full border border-ink px-6 py-2.5"
              style={{ opacity: saving ? 0.5 : 1 }}>
              <Text className="font-sans-semibold text-sm text-ink">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={activeTab === 'personal' ? handleSavePersonal : handleChangePassword}
              disabled={saving}
              className="min-w-[140px] items-center justify-center rounded-full bg-primary px-6 py-2.5"
              style={{ opacity: saving ? 0.85 : 1 }}>
              <Text className="font-sans-bold text-sm text-inverse">
                {saving ? 'Saving…' : 'Save Changes'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}