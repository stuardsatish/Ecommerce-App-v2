import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressCard, AddressCardSkeleton } from '@/components/AddressCard';
import { AddressFormSheet } from '@/components/AddressFormSheet';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { useAddressFormSheet } from '@/hooks/useAddressFormSheet';
import { useAddresses } from '@/hooks/useAddresses';
import { useThemeColors } from '@/hooks/useThemeColors';
import { confirmAction } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { ADDRESS_LIMIT, deleteAddress, formatAddressLine, setDefaultAddress } from '@/services/addresses';

/**
 * Address book (roadmap task 4.2): the customer's saved delivery addresses.
 * The database owns the bookkeeping (first address = default, one default,
 * promotion on delete, the 10-address cap — see services/addresses.js), so this
 * screen just lists, edits and reports.
 *
 * Add / Edit share one bottom sheet. The cap is enforced by the database, but
 * the Add button is also disabled at the limit with the reason shown, so the
 * customer isn't left to discover it from a failed save.
 */
export default function AddressesScreen() {
  const c = useThemeColors();
  // Fetch while focused, so coming back to this screen after the checkout
  // picker (or a second copy of this screen) changed the default shows it.
  const focused = useIsFocused();
  const { status, addresses, refresh, reload } = useAddresses({ enabled: focused });
  const sheet = useAddressFormSheet();
  const [busyId, setBusyId] = useState(null);

  const atLimit = addresses.length >= ADDRESS_LIMIT;

  const runOnAddress = async (id, action, successMessage) => {
    setBusyId(id);
    try {
      await action();
      toast.success(successMessage);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (address) => {
    const promotes = address.isDefault && addresses.length > 1;
    const ok = await confirmAction({
      title: 'Delete this address?',
      message: promotes
        ? `${formatAddressLine(address)}\n\nThis is your default address. Your most recently added address will become the default.`
        : formatAddressLine(address),
      confirmText: 'Delete',
    });
    if (!ok) return;
    runOnAddress(address.id, () => deleteAddress(address.id), 'Address deleted');
  };

  const handleSetDefault = (address) =>
    runOnAddress(address.id, () => setDefaultAddress(address.id), `${address.label} is now your default address`);

  const addButton = (
    <Pressable
      onPress={() => sheet.open()}
      disabled={atLimit}
      accessibilityRole="button"
      accessibilityLabel="Add new address"
      accessibilityState={{ disabled: atLimit }}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-full ${
        atLimit ? 'bg-disabled' : 'bg-primary active:opacity-80'
      }`}>
      <Icon name="plus" size={16} color={atLimit ? c.disabledFg : c.inverse} />
      <Text className={`font-sans-bold text-sm ${atLimit ? 'text-disabled-fg' : 'text-inverse'}`}>
        Add new address
      </Text>
    </Pressable>
  );

  let body;
  if (status === 'loading') {
    body = (
      <View className="gap-3 px-5 pt-4">
        {[0, 1, 2].map((i) => (
          <AddressCardSkeleton key={i} />
        ))}
      </View>
    );
  } else if (status === 'error') {
    body = <ErrorState message="Couldn't load your addresses." onRetry={reload} />;
  } else if (addresses.length === 0) {
    body = (
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Icon name="map-pin" size={44} color={c.borderStrong} />
        <Text className="font-sans-semibold text-sm text-muted">No saved addresses yet.</Text>
        <Text className="text-center text-[13px] text-muted">
          Save a delivery address once and pick it in a tap at checkout.
        </Text>
        <Pressable
          onPress={() => sheet.open()}
          accessibilityRole="button"
          accessibilityLabel="Add new address"
          className="rounded-full bg-primary px-6 py-3 active:opacity-80">
          <Text className="font-sans-bold text-sm text-inverse">Add new address</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={addresses}
        keyExtractor={(a) => a.id}
        contentContainerClassName="gap-3 px-5 py-4"
        ListHeaderComponent={
          <View className="mb-1 gap-2">
            <Text className="text-xs text-muted">
              {addresses.length} of {ADDRESS_LIMIT} addresses saved
            </Text>
            {addButton}
            {atLimit ? (
              <Text className="text-xs text-muted">
                You&apos;ve reached the limit of {ADDRESS_LIMIT} saved addresses. Delete one to add
                another.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <AddressCard
            address={item}
            busy={busyId === item.id}
            onEdit={() => sheet.open(item)}
            onDelete={() => handleDelete(item)}
            onSetDefault={() => handleSetDefault(item)}
          />
        )}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1">
        <AppHeader title="My Addresses" />
        {body}
      </SafeAreaView>

      <AddressFormSheet
        key={sheet.sheetKey}
        {...sheet.props}
        isFirst={status === 'ready' && addresses.length === 0}
        onSaved={refresh}
      />
    </View>
  );
}