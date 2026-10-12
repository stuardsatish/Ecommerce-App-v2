import { useState } from 'react';
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
import { toast } from '@/lib/toast';
import { createAddress, LABEL_PRESETS, updateAddress, validateAddress } from '@/services/addresses';

const inputClass = 'rounded-xl bg-surface-muted px-4 py-3 font-sans text-sm text-ink';

// "Other" is the only preset that carries free text, so a saved label that is
// neither Home nor Work reopens as Other with that text in the box.
const splitLabel = (label) =>
  label === 'Home' || label === 'Work'
    ? { labelChoice: label, customLabel: '' }
    : { labelChoice: 'Other', customLabel: label && label !== 'Other' ? label : '' };

const initialValues = (address, prefill) => ({
  ...splitLabel(address ? address.label : 'Home'),
  fullName: address ? address.fullName : prefill?.fullName || '',
  phone: address ? address.phone : prefill?.phone || '',
  line1: address?.line1 || '',
  line2: address?.line2 || '',
  landmark: address?.landmark || '',
  city: address?.city || '',
  state: address?.state || '',
  pincode: address?.pincode || '',
  isDefault: !!address?.isDefault,
});

function Field({ label, error, children }) {
  return (
    <View className="gap-1.5">
      <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">{label}</Text>
      {children}
      {error ? <Text className="font-sans-medium text-xs text-error">{error}</Text> : null}
    </View>
  );
}

/**
 * The add / edit address form (roadmap task 4.2), without any frame, so it can
 * sit in its own bottom sheet (<AddressFormSheet>) or inside the checkout
 * picker's sheet. Validation is `validateAddress`'s (the shared contract's
 * rules); errors only appear once Save has been tried, and then follow the
 * fields live as they are fixed.
 *
 * "Make this my default address" is forced on and disabled when it has to be:
 * for a customer's first address, when this IS the default (there is no way to
 * un-default one — pick another instead), or when the caller asks for it
 * (`forceDefault`, used by checkout where saving means "deliver here").
 *
 * `onSaved(saved, { created })` fires after the row is stored. A server
 * refusal (the 10-address limit, RLS, network) stays on the form: shown inline
 * as well as toasted, because on iOS this form's Modal window can cover a toast.
 */
export function AddressForm({
  address = null,
  prefill,
  isFirst = false,
  forceDefault = false,
  defaultNote,
  onSaved,
  onCancel,
}) {
  const c = useThemeColors();
  const [values, setValues] = useState(() => initialValues(address, prefill));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const editing = !!address;
  const defaultLocked = forceDefault || isFirst || (editing && address.isDefault);
  const isDefault = defaultLocked || values.isDefault;
  const label =
    values.labelChoice === 'Other' ? values.customLabel.trim() || 'Other' : values.labelChoice;

  const payload = {
    label,
    fullName: values.fullName,
    phone: values.phone,
    line1: values.line1,
    line2: values.line2,
    landmark: values.landmark,
    city: values.city,
    state: values.state,
    pincode: values.pincode,
    isDefault,
  };
  const errors = attempted ? validateAddress(payload).errors : {};
  const hasErrors = Object.keys(errors).length > 0;

  const set = (key) => (v) => setValues((prev) => ({ ...prev, [key]: v }));
  const border = (key) => (errors[key] ? 'border border-error' : 'border border-transparent');

  const handleSave = async () => {
    if (saving) return;
    if (!validateAddress(payload).ok) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const saved = editing ? await updateAddress(address.id, payload) : await createAddress(payload);
      onSaved?.(saved, { created: !editing });
    } catch (err) {
      const message = err?.message || 'Could not save the address. Please try again.';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-sans-bold text-lg text-ink">
          {editing ? 'Edit address' : 'Add new address'}
        </Text>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="active:opacity-60">
          <Icon name="x" size={20} color={c.muted} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 pb-3">
        <Field label="Label" error={errors.label}>
          <View className="flex-row flex-wrap gap-2">
            {LABEL_PRESETS.map((preset) => {
              const active = values.labelChoice === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => set('labelChoice')(preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`rounded-full border px-3.5 py-2 ${
                    active ? 'border-ink bg-ink' : 'border-border'
                  }`}>
                  <Text
                    className={`font-sans-semibold text-xs ${active ? 'text-inverse' : 'text-body'}`}>
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {values.labelChoice === 'Other' ? (
            <TextInput
              value={values.customLabel}
              onChangeText={set('customLabel')}
              placeholder="e.g. Parents' house"
              placeholderTextColor={c.muted}
              maxLength={30}
              accessibilityLabel="Custom label"
              className={`${inputClass} ${border('label')}`}
            />
          ) : null}
        </Field>

        <Field label="Full name" error={errors.fullName}>
          <TextInput
            value={values.fullName}
            onChangeText={set('fullName')}
            placeholder="Who will receive the order"
            placeholderTextColor={c.muted}
            autoComplete="name"
            maxLength={100}
            accessibilityLabel="Full name"
            className={`${inputClass} ${border('fullName')}`}
          />
        </Field>

        <Field label="Phone" error={errors.phone}>
          <TextInput
            value={values.phone}
            onChangeText={set('phone')}
            placeholder="10-digit mobile number"
            placeholderTextColor={c.muted}
            keyboardType="phone-pad"
            maxLength={17}
            accessibilityLabel="Phone"
            className={`${inputClass} ${border('phone')}`}
          />
        </Field>

        <Field label="Address line 1" error={errors.line1}>
          <TextInput
            value={values.line1}
            onChangeText={set('line1')}
            placeholder="House / flat no., street"
            placeholderTextColor={c.muted}
            maxLength={200}
            accessibilityLabel="Address line 1"
            className={`${inputClass} ${border('line1')}`}
          />
        </Field>

        <Field label="Address line 2 (optional)" error={errors.line2}>
          <TextInput
            value={values.line2}
            onChangeText={set('line2')}
            placeholder="Area, locality"
            placeholderTextColor={c.muted}
            maxLength={200}
            accessibilityLabel="Address line 2"
            className={`${inputClass} ${border('line2')}`}
          />
        </Field>

        <Field label="Landmark (optional)" error={errors.landmark}>
          <TextInput
            value={values.landmark}
            onChangeText={set('landmark')}
            placeholder="Near…"
            placeholderTextColor={c.muted}
            maxLength={100}
            accessibilityLabel="Landmark"
            className={`${inputClass} ${border('landmark')}`}
          />
        </Field>

        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Field label="City" error={errors.city}>
              <TextInput
                value={values.city}
                onChangeText={set('city')}
                placeholder="City"
                placeholderTextColor={c.muted}
                maxLength={80}
                accessibilityLabel="City"
                className={`${inputClass} ${border('city')}`}
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="State" error={errors.state}>
              <TextInput
                value={values.state}
                onChangeText={set('state')}
                placeholder="State"
                placeholderTextColor={c.muted}
                maxLength={80}
                accessibilityLabel="State"
                className={`${inputClass} ${border('state')}`}
              />
            </Field>
          </View>
        </View>

        <Field label="Pincode" error={errors.pincode}>
          <TextInput
            value={values.pincode}
            onChangeText={(v) => set('pincode')(v.replace(/\D/g, ''))}
            placeholder="6-digit pincode"
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
            maxLength={6}
            accessibilityLabel="Pincode"
            className={`${inputClass} ${border('pincode')}`}
          />
        </Field>

        <Pressable
          onPress={() => set('isDefault')(!values.isDefault)}
          disabled={defaultLocked}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDefault, disabled: defaultLocked }}
          accessibilityLabel="Make this my default address"
          className="flex-row items-center gap-3 py-1">
          <View
            className={`h-5 w-5 items-center justify-center rounded border ${
              isDefault ? 'border-primary bg-primary' : 'border-border-strong'
            }`}
            style={{ opacity: defaultLocked ? 0.6 : 1 }}>
            {isDefault ? <Icon name="check" size={13} color={c.inverse} /> : null}
          </View>
          <View className="flex-1">
            <Text className="font-sans-semibold text-[13px] text-ink">Make this my default address</Text>
            {defaultLocked ? (
              <Text className="text-xs text-muted">
                {defaultNote ||
                  (editing && address.isDefault
                    ? 'This is your default address. To change it, make another address the default.'
                    : 'Your first saved address is always your default.')}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </ScrollView>

      {submitError ? (
        <Text className="mb-2 font-sans-medium text-xs text-error">{submitError}</Text>
      ) : hasErrors ? (
        <Text className="mb-2 font-sans-medium text-xs text-error">
          Please fix the highlighted fields.
        </Text>
      ) : null}

      <View className="flex-row items-center justify-end gap-3 pb-2 pt-1">
        <Pressable
          onPress={onCancel}
          disabled={saving}
          className="rounded-full border border-ink px-6 py-2.5"
          style={{ opacity: saving ? 0.5 : 1 }}>
          <Text className="font-sans-semibold text-sm text-ink">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save address"
          className="min-w-[140px] items-center justify-center rounded-full bg-primary px-6 py-2.5"
          style={{ opacity: saving ? 0.85 : 1 }}>
          <Text className="font-sans-bold text-sm text-inverse">
            {saving ? 'Saving…' : 'Save address'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

/**
 * Bottom sheet around <AddressForm> — same Modal / KeyboardAvoidingView
 * construction as EditProfileSheet, so the fields stay reachable above the
 * keyboard. See `useAddressFormSheet` for the open/close state and why the
 * sheet is keyed per opening. `onSaved` runs before the sheet closes.
 */
export function AddressFormSheet({ visible, onClose, address, prefill, isFirst, forceDefault, onSaved }) {
  const handleSaved = (saved, meta) => {
    onSaved?.(saved, meta);
    onClose();
    // After the sheet is gone, so an iOS Modal window can't cover it (see lib/toast.js).
    toast.success(meta.created ? 'Address saved' : 'Address updated');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay" onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="max-h-[92%] rounded-t-2xl bg-surface p-5">
        <AddressForm
          address={address}
          prefill={prefill}
          isFirst={isFirst}
          forceDefault={forceDefault}
          onSaved={handleSaved}
          onCancel={onClose}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}