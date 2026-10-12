import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { AddressForm } from '@/components/AddressFormSheet';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useAddressPrefill } from '@/hooks/useAddressFormSheet';
import { useAddresses } from '@/hooks/useAddresses';
import { useThemeColors } from '@/hooks/useThemeColors';
import { toast } from '@/lib/toast';
import { ADDRESS_LIMIT, formatAddressLine, formatPhone, setDefaultAddress } from '@/services/addresses';

/**
 * Checkout's "Change delivery address" sheet (roadmap task 4.2).
 *
 * Picking an address means making it the default: checkout, COD validation and
 * invoices all read `profiles.address`, which the database mirrors from the
 * default, so nothing else has to be sent anywhere. "Add new address" swaps the
 * SAME sheet over to the address form (a second Modal opened from inside one is
 * unreliable on iOS), and a saved address is selected straight away.
 *
 * `startInForm` opens straight on the form — for a customer with no address,
 * where the list would just be empty. The parent keys the sheet per opening so
 * its view and form state start fresh each time.
 */
export function AddressPickerSheet({ visible, onClose, startInForm = false }) {
  const c = useThemeColors();
  const prefill = useAddressPrefill();
  const { status, addresses, reload } = useAddresses({ enabled: visible });
  const [inForm, setInForm] = useState(startInForm);
  const [selectingId, setSelectingId] = useState(null);
  const [selectError, setSelectError] = useState('');

  const atLimit = addresses.length >= ADDRESS_LIMIT;

  const handleSelect = async (address) => {
    if (selectingId) return;
    if (address.isDefault) {
      onClose();
      return;
    }
    setSelectingId(address.id);
    setSelectError('');
    try {
      await setDefaultAddress(address.id);
      onClose();
      toast.success(`Delivering to your ${address.label} address`);
    } catch (err) {
      const message = err?.message || 'Could not change your delivery address.';
      setSelectError(message);
      toast.error(message);
    } finally {
      setSelectingId(null);
    }
  };

  // The saved address was made the default by the form itself (forceDefault).
  const handleSaved = () => {
    onClose();
    toast.success('Delivery address updated');
  };

  // Android's back button: from the form it returns to the list.
  const handleRequestClose = () => {
    if (inForm && !startInForm) setInForm(false);
    else onClose();
  };

  let list;
  if (status === 'loading') {
    list = (
      <View className="gap-2.5">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </View>
    );
  } else if (status === 'error') {
    list = (
      <View className="items-center gap-3 py-6">
        <Text className="font-sans-semibold text-sm text-ink">Couldn&apos;t load your addresses.</Text>
        <Pressable
          onPress={reload}
          accessibilityRole="button"
          className="rounded-full border border-border px-6 py-2.5 active:opacity-70">
          <Text className="font-sans-bold text-sm text-primary">Try Again</Text>
        </Pressable>
      </View>
    );
  } else if (addresses.length === 0) {
    list = (
      <Text className="py-4 text-center text-[13px] text-muted">You have no saved addresses yet.</Text>
    );
  } else {
    list = (
      <View className="gap-2.5">
        {addresses.map((address) => {
          const selected = address.isDefault;
          return (
            <Pressable
              key={address.id}
              onPress={() => handleSelect(address)}
              disabled={!!selectingId}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${address.label} address, ${address.fullName}`}
              className={`flex-row gap-3 rounded-xl border p-3 active:opacity-80 ${
                selected ? 'border-primary bg-surface-muted' : 'border-border'
              }`}
              style={{ opacity: selectingId && selectingId !== address.id ? 0.5 : 1 }}>
              <View
                className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-primary' : 'border-border-strong'
                }`}>
                {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </View>
              <View className="flex-1 gap-1">
                <View className="flex-row items-center gap-2">
                  <Text className="font-sans-bold text-[13px] text-ink">{address.label}</Text>
                  {selected ? (
                    <View className="rounded-full bg-success-subtle px-2 py-0.5">
                      <Text className="font-sans-semibold text-[10px] text-primary">Default</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="font-sans-semibold text-[13px] text-ink">
                  {address.fullName}
                  {address.phone ? ` · ${formatPhone(address.phone)}` : ''}
                </Text>
                <Text className="text-xs leading-[18px] text-body">{formatAddressLine(address)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleRequestClose}>
      <Pressable className="flex-1 bg-overlay" onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="max-h-[92%] rounded-t-2xl bg-surface p-5">
        {inForm ? (
          <AddressForm
            prefill={prefill}
            forceDefault
            defaultNote="This address will be used to deliver this order."
            onSaved={handleSaved}
            onCancel={startInForm ? onClose : () => setInForm(false)}
          />
        ) : (
          <>
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="font-sans-bold text-lg text-ink">Deliver to</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                className="active:opacity-60">
                <Icon name="x" size={20} color={c.muted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 pb-3">
              {list}
              {selectError ? (
                <Text className="font-sans-medium text-xs text-error">{selectError}</Text>
              ) : null}
            </ScrollView>

            <View className="gap-2 pb-2 pt-1">
              <Pressable
                onPress={() => setInForm(true)}
                disabled={atLimit || status !== 'ready'}
                accessibilityRole="button"
                accessibilityLabel="Add new address"
                accessibilityState={{ disabled: atLimit || status !== 'ready' }}
                className={`h-12 flex-row items-center justify-center gap-2 rounded-full ${
                  atLimit || status !== 'ready' ? 'bg-disabled' : 'bg-primary active:opacity-80'
                }`}>
                <Icon
                  name="plus"
                  size={16}
                  color={atLimit || status !== 'ready' ? c.disabledFg : c.inverse}
                />
                <Text
                  className={`font-sans-bold text-sm ${
                    atLimit || status !== 'ready' ? 'text-disabled-fg' : 'text-inverse'
                  }`}>
                  Add new address
                </Text>
              </Pressable>
              {atLimit ? (
                <Text className="text-center text-xs text-muted">
                  You&apos;ve reached the limit of {ADDRESS_LIMIT} saved addresses. Delete one to add
                  another.
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/addresses');
                }}
                accessibilityRole="button"
                className="items-center py-2 active:opacity-60">
                <Text className="font-sans-semibold text-[13px] text-link">Manage addresses</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}