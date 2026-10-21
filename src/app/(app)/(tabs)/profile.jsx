import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';

import { AddressFormSheet } from '@/components/AddressFormSheet';
import { AppHeader } from '@/components/AppHeader';
import { EditProfileSheet } from '@/components/EditProfileSheet';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useAddressFormSheet } from '@/hooks/useAddressFormSheet';
import { useAuth } from '@/hooks/useAuth';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { describeProfileAddress } from '@/services/addresses';
import { setUser } from '@/store/UserSlice';
import { validateImageFile } from '@/utils/uploadValidation';

const getInitials = (name) => {
  if (!name) return 'U';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
};

const formatDate = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Content-aware loading state, ported from MyProfile.jsx's `renderSkeleton()`
 * mobile branch (via its `skeletonBlock`/`skeletonRow`/`skeletonCard`
 * helpers). Replaces a plain "Loading…" string: the source's own comment for
 * this is that it "mirrors the real profile layout … so the swap to real data
 * causes no jump", which a centred one-liner doesn't do.
 *
 * Dimensions are the source's, in order — an 80px avatar circle, 160×20 name,
 * 200×13 email, 110×22 verification pill, then three cards of 4/4/1 label+
 * value rows (35%×12 over 65%×16).
 */
const SkeletonCard = ({ rows }) => (
  <View className="rounded-xl bg-surface p-4 shadow-card">
    <Skeleton className="mb-3 h-4 w-1/2" />
    <View className="gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="gap-1.5">
          <Skeleton className="h-3 w-[35%]" />
          <Skeleton className="h-4 w-[65%]" />
        </View>
      ))}
    </View>
  </View>
);

const ProfileSkeleton = () => (
  <View className="flex-1">
    <View className="items-center gap-2 px-5 pb-4 pt-6">
      <Skeleton variant="circular" className="h-20 w-20" />
      <Skeleton className="mt-1 h-5 w-40" />
      <Skeleton className="h-3 w-52" />
      <Skeleton className="h-[22px] w-28 rounded-full" />
    </View>
    <View className="gap-4 px-4">
      <SkeletonCard rows={4} />
      <SkeletonCard rows={4} />
      <SkeletonCard rows={1} />
    </View>
  </View>
);

/**
 * Ported from MyProfile.jsx — both the mobile AND desktop layouts (the
 * source's mobile/desktop split here only changes the outer arrangement:
 * stacked cards vs. a header card + 2-column grid — the card contents, edit
 * modal, and every handler are 100% shared). This RN screen follows the
 * mobile stacked-card layout, matching this app's single form factor.
 *
 * The "Log out" button is NOT from MyProfile.jsx (the source has no logout
 * button on this page at all) — it's Phase 5's addition, kept and
 * restyled here rather than removed, since Profile is this app's only
 * account-menu surface (no separate settings/menu screen exists).
 *
 * Avatar upload: `supabase.storage.upload()` needs an ArrayBuffer/Blob on
 * RN (there's no web `File` object) — fetches the picked asset's local
 * `file://` URI and converts it, which the source's browser-native
 * `<input type="file">` never needed to do.
 */
export default function ProfileScreen() {
  const dispatch = useDispatch();
  const c = useThemeColors();
  const { logout } = useAuth();
  const reduxUser = useSelector((state) => state.user.user);

  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState({});
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetTab, setSheetTab] = useState('personal');
  const addressSheet = useAddressFormSheet();

  useEffect(() => {
    let active = true;
    const load = async () => {
      const {
        data: { user: sUser },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!sUser) {
        router.replace('/login');
        return;
      }
      setAuthUser(sUser);
      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sUser.id)
        .single();
      if (!active) return;
      if (error) console.error('Profile read error:', error);
      setProfile(profileRow || {});
      setLoading(false);
    };
    load().catch((err) => {
      console.error('Profile load error:', err);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const displayName = profile.name || authUser?.user_metadata?.name || reduxUser?.name || 'User';
  const initials = getInitials(displayName);
  const photoURL = profile.photo_url || authUser?.user_metadata?.avatar_url || '';
  const email = authUser?.email || profile.email || '';
  const emailVerified = !!authUser?.email_confirmed_at;
  const uid = authUser?.id || '';
  const memberSince = formatDate(authUser?.created_at || profile.created_at);
  // The DEFAULT address from the address book. It is read from the store, not
  // this screen's own `profile` copy: the address service keeps the store's
  // `address` in step, so this follows changes made on the Addresses screen
  // without a reload.
  const defaultAddress = describeProfileAddress(reduxUser?.address ?? profile.address, {
    name: displayName,
    phone: profile.phone,
  });
  const uidShort = uid ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : '—';

  const openSheet = (tab) => {
    setSheetTab(tab);
    setSheetVisible(true);
  };

  const handleSaved = (updated) => {
    setProfile(updated);
    dispatch(setUser({ ...updated, uid: authUser.id }));
  };

  const copyUid = async () => {
    if (!uid) return;
    try {
      await Clipboard.setStringAsync(uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    const check = validateImageFile(asset, { maxBytes: 2 * 1024 * 1024, allowGif: false });
    if (!check.ok) {
      // Source surfaces the validator's own message through showToast, not a
      // blocking dialog — nothing is lost if it's missed, the picker just
      // didn't take the file.
      toast.error(check.error);
      return;
    }

    try {
      setUploading(true);
      const ext = (asset.fileName || asset.uri).split('.').pop()?.split('?')[0] || 'jpg';
      const path = `${authUser.id}/avatar.${ext}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { upsert: true, contentType: asset.mimeType || 'image/jpeg' });
      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path);

      const { data: updated, error } = await supabase
        .from('profiles')
        .update({ photo_url: publicUrl })
        .eq('id', authUser.id)
        .select()
        .single();
      if (error) throw error;
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });

      setProfile(updated);
      dispatch(setUser({ ...updated, uid: authUser.id }));
      toast.success('Profile photo updated'); // source: MyProfile's showToast
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error('Photo upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const Row = ({ label, value, extra }) => (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <View className="gap-0.5" style={{ minWidth: 0 }}>
        <Text className="font-sans-medium text-[11px] uppercase tracking-wide text-muted">{label}</Text>
        <Text className="font-sans-semibold text-[13px] text-ink">{value || '—'}</Text>
      </View>
      {extra}
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
          <AppHeader title="Profile" />
          <ProfileSkeleton />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <AppHeader title="Profile" />
        <ScrollView contentContainerClassName="gap-4 px-4 pb-6">
          <View className="items-center gap-2 pt-6">
            <View className="relative">
              <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-error-subtle">
                {photoURL ? (
                  <Image
                    source={{ uri: photoURL }}
                    className="h-full w-full"
                    contentFit="cover"
                    transition={150}
                    accessibilityLabel={`${displayName}'s profile photo`}
                  />
                ) : (
                  <Text className="font-sans-bold text-2xl text-primary">{initials}</Text>
                )}
              </View>
              <Pressable
                onPress={handlePickPhoto}
                disabled={uploading}
                accessibilityLabel="Change photo"
                className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full border-2 border-inverse bg-primary active:opacity-80">
                <Icon name="camera" size={12} color={c.inverse} />
              </Pressable>
            </View>
            <Text className="font-sans-bold text-xl text-ink">{displayName}</Text>
            <Text className="text-[13px] text-muted">{email}</Text>
            <View
              className={`rounded-full px-2.5 py-1 ${
                emailVerified ? 'bg-success-subtle' : 'bg-error-subtle'
              }`}>
              <Text
                className={`font-sans-semibold text-[11px] ${
                  emailVerified ? 'text-primary' : 'text-error'
                }`}>
                {emailVerified ? 'Verified' : 'Unverified'}
              </Text>
            </View>
          </View>

          <View className="gap-2 rounded-xl bg-surface p-4 shadow-card">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="font-sans-semibold text-sm text-ink">Personal Information</Text>
              <Pressable
                onPress={() => openSheet('personal')}
                accessibilityRole="button"
                accessibilityLabel="Edit personal info"
                hitSlop={8}
                className="active:opacity-60">
                <Icon name="pencil" size={16} color={c.primary} />
              </Pressable>
            </View>
            <Row label="Full Name" value={profile.name} />
            <Row label="Gender" value={profile.gender} />
            <Row label="Date of Birth" value={formatDate(profile.date_of_birth) || profile.date_of_birth} />
            <Row label="Phone" value={profile.phone} />
          </View>

          <View className="gap-2 rounded-xl bg-surface p-4 shadow-card">
            <Text className="mb-1 font-sans-semibold text-sm text-ink">Account &amp; Security</Text>
            <Row label="Email Address" value={email} extra={<Icon name="lock" size={14} color={c.muted} />} />
            <Row
              label="Password"
              value="••••••••"
              extra={
                <Pressable onPress={() => openSheet('password')}>
                  <Text className="font-sans-bold text-xs text-primary">Change</Text>
                </Pressable>
              }
            />
            <Row label="Member Since" value={memberSince} />
            <Row
              label="User ID"
              value={uidShort}
              extra={
                <Pressable
                  onPress={copyUid}
                  accessibilityRole="button"
                  accessibilityLabel="Copy UID"
                  hitSlop={8}
                  className="h-7 w-7 items-center justify-center active:opacity-60">
                  {/* Source: `copied ? <Check size={15} color={C.green}> : <Copy size={15}>`,
                      where `C.green` is itself `var(--color-primary)`. */}
                  <Icon
                    name={copied ? 'check' : 'copy'}
                    size={15}
                    color={copied ? c.primary : c.muted}
                  />
                </Pressable>
              }
            />
          </View>

          <View className="gap-2 rounded-xl bg-surface p-4 shadow-card">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="font-sans-semibold text-sm text-ink">Delivery Address</Text>
              <Pressable
                onPress={() => router.push('/addresses')}
                accessibilityRole="button"
                accessibilityLabel="Manage addresses"
                hitSlop={8}
                className="flex-row items-center gap-0.5 active:opacity-60">
                <Text className="font-sans-semibold text-xs text-primary">Manage addresses</Text>
                <Icon name="chevron-right" size={14} color={c.primary} />
              </Pressable>
            </View>
            {defaultAddress ? (
              <View className="gap-1">
                <View className="flex-row items-center gap-2">
                  {defaultAddress.label ? (
                    <View className="rounded-full bg-surface-muted px-2.5 py-0.5">
                      <Text className="font-sans-semibold text-[11px] text-body">{defaultAddress.label}</Text>
                    </View>
                  ) : null}
                  <View className="rounded-full bg-success-subtle px-2.5 py-0.5">
                    <Text className="font-sans-semibold text-[11px] text-primary">Default</Text>
                  </View>
                </View>
                {defaultAddress.name || defaultAddress.phone ? (
                  <Text className="font-sans-semibold text-[13px] text-ink">
                    {defaultAddress.name}
                    {defaultAddress.name && defaultAddress.phone ? ' · ' : ''}
                    {defaultAddress.phone}
                  </Text>
                ) : null}
                <Text className="text-[13px] leading-5 text-body">{defaultAddress.line}</Text>
                {defaultAddress.landmark ? (
                  <Text className="text-xs text-muted">Landmark: {defaultAddress.landmark}</Text>
                ) : null}
              </View>
            ) : (
              <Pressable
                onPress={() => addressSheet.open()}
                accessibilityRole="button"
                className="items-center rounded-xl border border-dashed border-border-subtle py-4">
                <Text className="font-sans-semibold text-[13px] text-primary">+ Add Address</Text>
              </Pressable>
            )}
          </View>

          {/* Returns & exchanges (Phase 6): the website reaches "My Returns" from its account menu; here Profile is the
              account surface, next to the kebab menu entry. */}
          <View className="gap-2 rounded-xl bg-surface p-4 shadow-card">
            <Text className="mb-1 font-sans-semibold text-sm text-ink">Orders &amp; Returns</Text>
            {[
              { label: 'Past Orders', icon: 'archive', path: '/orders?tab=PAST' },
              { label: 'My Returns & Exchanges', icon: 'rotate-ccw', path: '/returns' },
            ].map((item) => (
              <Pressable
                key={item.path}
                onPress={() => router.push(item.path)}
                accessibilityRole="button"
                className="-mx-2 flex-row items-center justify-between rounded-lg px-2 py-2.5 active:bg-surface-muted">
                <View className="flex-row items-center gap-3">
                  <Icon name={item.icon} size={16} color={c.primary} />
                  <Text className="font-sans text-[13px] text-ink">{item.label}</Text>
                </View>
                <Icon name="chevron-right" size={16} color={c.muted} />
              </Pressable>
            ))}
          </View>

          {/* Help & Support (roadmap tasks 1.14/1.16). The web app surfaces
              these through its Footer; this app has no footer, so Profile —
              its only account surface — carries them alongside the kebab
              menu's "Help Center" entry. */}
          <View className="gap-2 rounded-xl bg-surface p-4 shadow-card">
            <Text className="mb-1 font-sans-semibold text-sm text-ink">Help &amp; Support</Text>
            {[
              { label: 'Help Center / FAQ', icon: 'info', path: '/support/faq' },
              { label: 'Return & Refund Policy', icon: 'rotate-ccw', path: '/support/returns' },
              { label: 'Delivery Policy', icon: 'truck', path: '/support/shipping' },
            ].map((item) => (
              <Pressable
                key={item.path}
                onPress={() => router.push(item.path)}
                accessibilityRole="button"
                className="-mx-2 flex-row items-center justify-between rounded-lg px-2 py-2.5 active:bg-surface-muted">
                <View className="flex-row items-center gap-3">
                  <Icon name={item.icon} size={16} color={c.primary} />
                  <Text className="font-sans text-[13px] text-ink">{item.label}</Text>
                </View>
                <Icon name="chevron-right" size={16} color={c.muted} />
              </Pressable>
            ))}
          </View>

          <Pressable
            className="items-center rounded-xl border border-border p-4 active:opacity-70"
            onPress={() => logout(authUser?.id)}>
            <Text className="font-sans-semibold text-link">Log out</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <EditProfileSheet
        visible={sheetVisible}
        initialTab={sheetTab}
        onClose={() => setSheetVisible(false)}
        profile={profile}
        authUser={authUser}
        onSaved={handleSaved}
      />

      {/* Only offered when there is no default address, i.e. nothing is saved. */}
      <AddressFormSheet key={addressSheet.sheetKey} {...addressSheet.props} isFirst />
    </View>
  );
}