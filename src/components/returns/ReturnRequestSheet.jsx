import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { PhotoPicker } from '@/components/returns/RequestBits';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { returnsService } from '@/services/returns';
import { orderNo } from '@/utils/orders';
import {
  defaultReplacement,
  describeEligibility,
  reasonOptions,
  replacementOptions,
  requestTypeLabel,
  validateRequestForm,
} from '@/utils/requestModel';
import { newRequestId } from '@/utils/returnsMedia';

const cur = (n) => `₹${Number(n || 0).toFixed(2)}`;

/** What one purchased line could be swapped for, given the catalogue entry { product, variants } of its product (null while loading). */
const optionsOf = (cat, line) =>
  cat ? replacementOptions(cat.product, cat.variants, { variantId: line.variant_id || '', unitPrice: line.unit_price }) : [];

const FIELD_CLASS = 'rounded-xl border border-border bg-surface-muted px-3 font-sans text-sm text-ink';

function Label({ children }) {
  return <Text className="mb-1.5 font-sans-semibold text-xs uppercase tracking-wide text-body">{children}</Text>;
}

function FieldError({ text }) {
  return text ? <Text className="mt-1.5 font-sans-medium text-xs text-error">{text}</Text> : null;
}

/** One selectable row (reason / replacement choice). */
function Choice({ selected, disabled, onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      className={`flex-row items-center gap-3 rounded-xl border px-3 py-2.5 ${
        selected ? 'border-primary bg-surface-muted' : 'border-border'
      } ${disabled ? 'opacity-50' : 'active:opacity-80'}`}>
      <View
        className={`h-[18px] w-[18px] items-center justify-center rounded-full border ${
          selected ? 'border-primary' : 'border-border-strong'
        }`}>
        {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
      </View>
      <View className="flex-1" style={{ minWidth: 0 }}>
        {children}
      </View>
    </Pressable>
  );
}

/**
 * "Return items" / "Exchange items": the customer picks lines and quantities, a reason, adds photos and submits. Every rule shown
 * here is the server's own answer (get_order_eligibility); the form only explains it, and create_return_request() re-checks
 * everything. Mount it only while it is open (`{sheet ? <ReturnRequestSheet key=... /> : null}`) so the form starts fresh each time.
 * Twin of the website's features/returns/ReturnRequestModal.jsx.
 */
export function ReturnRequestSheet({
  order,
  eligibility,
  reasons,
  user,
  initialType = 'return',
  initialItemId = null,
  onClose,
  onDone,
}) {
  const c = useThemeColors();
  // One id per form: a retry (double tap, lost connection) can never create a second request - the database is idempotent on it.
  const [requestId] = useState(newRequestId);
  const items = useMemo(() => (eligibility && eligibility.items) || [], [eligibility]);
  const canReturn = items.some((i) => i.return && i.return.eligible);
  const canExchange = items.some((i) => i.exchange && i.exchange.eligible);
  const startType = initialType === 'exchange' ? (canExchange ? 'exchange' : 'return') : canReturn ? 'return' : 'exchange';

  const [type, setType] = useState(startType);
  const [lines, setLines] = useState(() =>
    Object.fromEntries(
      items.map((i) => [
        i.order_item_id,
        {
          selected: i.order_item_id === initialItemId && !!(i[startType] && i[startType].eligible),
          quantity: 1,
          replacementVariantId: undefined,
        },
      ])
    )
  );
  const [reasonCode, setReasonCode] = useState('');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState((user && user.phone) || '');
  const [photos, setPhotos] = useState([]);
  const [uploaded, setUploaded] = useState([]); // photos already stored for this request id (reused on a retry)
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [catalog, setCatalog] = useState({}); // productId -> { product, variants } (exchange only)

  const reasonList = useMemo(() => reasonOptions(reasons, type), [reasons, type]);
  const selectedReason = reasonList.find((r) => r.code === reasonCode);

  const optionsFor = (line) => optionsOf(catalog[line.product_id], line);

  // exchange: what each product can be swapped for (the same product: another size / colour, or the same item again)
  useEffect(() => {
    if (type !== 'exchange') return undefined;
    let alive = true;
    const ids = [...new Set(items.filter((i) => i.exchange && i.exchange.eligible).map((i) => i.product_id))];
    if (ids.length === 0) return undefined;
    (async () => {
      const [{ data: prods }, { data: vars }] = await Promise.all([
        supabase
          .from('products')
          .select('id, title, price, discount, discount_expiry, has_variants, main_option_enabled, stock, track_inventory, status')
          .in('id', ids),
        supabase.from('product_variants').select('id, product_id, name, price, stock, track_inventory, status').in('product_id', ids),
      ]);
      if (!alive) return;
      const next = {};
      for (const id of ids) {
        next[id] = { product: (prods || []).find((p) => p.id === id) || null, variants: (vars || []).filter((v) => v.product_id === id) };
      }
      setCatalog(next);
      // lines ticked before the options arrived (the line the customer tapped "Exchange" on) get the sensible default now
      setLines((cur0) => {
        const out = { ...cur0 };
        for (const line of items) {
          const st = cur0[line.order_item_id];
          if (!st || !st.selected || st.replacementVariantId !== undefined || !(line.exchange && line.exchange.eligible)) continue;
          const d = defaultReplacement(optionsOf(next[line.product_id], line));
          if (d !== null) out[line.order_item_id] = { ...st, replacementVariantId: d };
        }
        return out;
      });
    })().catch(() => {
      /* the exchange list simply shows no options; the server still validates */
    });
    return () => {
      alive = false;
    };
  }, [type, items]);

  const setLine = (id, patch) => setLines((cur0) => ({ ...cur0, [id]: { ...cur0[id], ...patch } }));

  const toggle = (line, on) => {
    const patch = { selected: on };
    const st = lines[line.order_item_id] || {};
    if (on && type === 'exchange' && st.replacementVariantId === undefined) {
      const d = defaultReplacement(optionsFor(line));
      if (d !== null) patch.replacementVariantId = d;
    }
    setLine(line.order_item_id, patch);
  };
  const eligibleLines = items.filter((i) => i[type] && i[type].eligible);
  const everySelected = eligibleLines.length > 0 && eligibleLines.every((i) => lines[i.order_item_id] && lines[i.order_item_id].selected);
  const selectAll = () => eligibleLines.forEach((i) => toggle(i, !everySelected));
  const switchType = (next) => {
    setType(next);
    setReasonCode('');
    setErrors({});
    setLines((cur0) => Object.fromEntries(Object.entries(cur0).map(([k, v]) => [k, { ...v, selected: false, replacementVariantId: undefined }])));
  };

  const close = async () => {
    if (busy) return;
    if (!done && uploaded.length) await returnsService.discardEvidence(uploaded.map((u) => u.path));
    onClose?.();
  };

  const submit = async () => {
    if (busy) return;
    const lineArray = items.map((i) => ({ orderItemId: i.order_item_id, ...lines[i.order_item_id] }));
    const v = validateRequestForm(
      { type, reasonCode, description, contactPhone, lines: lineArray, photos: photos.map((p) => p.file) },
      { orderId: order.id, requestId, eligibility, reasons: reasonList, uploaded }
    );
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      let evidence = uploaded;
      if (evidence.length === 0 && photos.length) {
        evidence = await returnsService.uploadEvidence({ uid: user.uid, requestId, files: photos.map((p) => p.file) });
        setUploaded(evidence);
      }
      const r = await returnsService.submit({ ...v.payload, p_evidence: evidence });
      setDone(r);
      onDone?.(r);
    } catch (err) {
      setErrors({ form: err.message || 'Could not submit the request' });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={onClose}>
        <Pressable className="flex-1 bg-overlay" onPress={onClose} />
        <View className="items-center gap-3 rounded-t-2xl bg-surface p-6">
          <Icon name="check-circle-2" size={44} color={c.success} />
          <Text className="font-sans-bold text-xl text-ink">{done.requestNo}</Text>
          <Text className="text-center font-sans text-sm text-body">
            Your {type} request is <Text className="font-sans-bold text-ink">pending review</Text>. We will look at it and let you know
            here and by notification. Nothing is refunded or replaced until it is approved
            {type === 'return' ? ' and the items have reached us' : ''}.
          </Text>
          <Pressable onPress={onClose} className="mt-2 h-12 w-full items-center justify-center rounded-full bg-primary active:opacity-90">
            <Text className="font-sans-bold text-base text-inverse">Done</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  const noun = type === 'exchange' ? 'exchange' : 'return';
  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      <Pressable className="flex-1 bg-overlay" onPress={close} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="max-h-[92%] rounded-t-2xl bg-surface p-5">
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text className="font-sans-bold text-lg text-ink">{type === 'exchange' ? 'Exchange items' : 'Return items'}</Text>
            <Text className="text-xs text-muted">Order #{orderNo(order)}</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} className="active:opacity-60">
            <Icon name="x" size={20} color={c.muted} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 pb-4">
          {canReturn && canExchange ? (
            <View className="flex-row gap-2">
              {['return', 'exchange'].map((t) => (
                <Pressable
                  key={t}
                  onPress={() => switchType(t)}
                  disabled={busy}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: type === t }}
                  className={`flex-1 items-center rounded-full py-2.5 ${type === t ? 'bg-primary' : 'border border-border bg-surface'}`}>
                  <Text className={`font-sans-semibold text-sm ${type === t ? 'text-inverse' : 'text-body'}`}>{requestTypeLabel(t)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View>
            <View className="mb-1.5 flex-row items-center justify-between gap-2">
              <Text className="font-sans-semibold text-xs uppercase tracking-wide text-body">Which items?</Text>
              <Pressable onPress={selectAll} disabled={busy} hitSlop={8} className="active:opacity-60">
                <Text className="font-sans-bold text-xs text-link">{everySelected ? 'Clear selection' : 'Select all eligible items'}</Text>
              </Pressable>
            </View>
            <View className="gap-2">
              {items.map((line) => {
                const verdict = describeEligibility(line[type], type);
                const st = lines[line.order_item_id] || {};
                const opts = type === 'exchange' && st.selected ? optionsFor(line) : [];
                return (
                  <View key={line.order_item_id} className={`rounded-xl border border-border p-3 ${verdict.eligible ? '' : 'opacity-60'}`}>
                    <Pressable
                      onPress={() => toggle(line, !st.selected)}
                      disabled={!verdict.eligible || busy}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!st.selected, disabled: !verdict.eligible }}
                      className="flex-row items-center gap-3">
                      <View
                        className={`h-5 w-5 items-center justify-center rounded border ${
                          st.selected ? 'border-primary bg-primary' : 'border-border-strong bg-surface'
                        }`}>
                        {st.selected ? <Icon name="check" size={13} color={c.inverse} /> : null}
                      </View>
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text className="font-sans-semibold text-[14px] text-ink">
                          {line.title}
                          {line.variant_name ? ` · ${line.variant_name}` : ''}
                        </Text>
                        <Text className="text-xs text-body">
                          Ordered {line.quantity} · {cur(line.unit_price)} each · {verdict.hint || verdict.label}
                        </Text>
                      </View>
                    </Pressable>

                    {verdict.eligible && st.selected && verdict.remaining > 1 ? (
                      <View className="mt-3 flex-row items-center justify-between">
                        <Text className="font-sans-semibold text-xs text-body">How many? (up to {verdict.remaining})</Text>
                        <View className="flex-row items-center gap-3">
                          <Pressable
                            onPress={() => setLine(line.order_item_id, { quantity: Math.max(1, (st.quantity || 1) - 1) })}
                            disabled={busy || (st.quantity || 1) <= 1}
                            accessibilityLabel="Fewer"
                            className="h-8 w-8 items-center justify-center rounded-full border border-border active:opacity-70"
                            style={{ opacity: (st.quantity || 1) <= 1 ? 0.4 : 1 }}>
                            <Icon name="minus" size={14} color={c.ink} />
                          </Pressable>
                          <Text className="min-w-[20px] text-center font-sans-bold text-base text-ink">{st.quantity || 1}</Text>
                          <Pressable
                            onPress={() => setLine(line.order_item_id, { quantity: Math.min(verdict.remaining, (st.quantity || 1) + 1) })}
                            disabled={busy || (st.quantity || 1) >= verdict.remaining}
                            accessibilityLabel="More"
                            className="h-8 w-8 items-center justify-center rounded-full border border-border active:opacity-70"
                            style={{ opacity: (st.quantity || 1) >= verdict.remaining ? 0.4 : 1 }}>
                            <Icon name="plus" size={14} color={c.ink} />
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

                    {type === 'exchange' && st.selected ? (
                      <View className="mt-3 gap-2">
                        <Label>I would like instead</Label>
                        {opts.length === 0 ? (
                          <Text className="text-xs text-muted">Loading the options...</Text>
                        ) : (
                          opts.map((o) => (
                            <Choice
                              key={o.variantId || 'main'}
                              selected={st.replacementVariantId === o.variantId}
                              disabled={!o.inStock || busy}
                              onPress={() => setLine(line.order_item_id, { replacementVariantId: o.variantId })}>
                              <Text className="font-sans-semibold text-[13px] text-ink">
                                {o.label}
                                {o.isSame ? ' (same as bought)' : ''}
                              </Text>
                              <Text className="text-xs text-body">
                                {cur(o.price)}
                                {o.difference ? ` (${o.difference > 0 ? '+' : '-'}${cur(Math.abs(o.difference))} vs. what you paid)` : ''}
                                {o.inStock ? '' : ' · out of stock'}
                              </Text>
                            </Choice>
                          ))
                        )}
                        <Text className="text-xs text-muted">
                          Any price difference is noted on your request; you are not charged or refunded automatically.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <FieldError text={errors.items} />
            <FieldError text={errors.replacement} />
          </View>

          <View>
            <Label>What is the problem?</Label>
            <View className="gap-2">
              {reasonList.map((r) => (
                <Choice key={r.code} selected={reasonCode === r.code} disabled={busy} onPress={() => setReasonCode(r.code)}>
                  <Text className="font-sans-semibold text-[13px] text-ink">{r.label}</Text>
                </Choice>
              ))}
            </View>
            <FieldError text={errors.reasonCode} />
          </View>

          <View>
            <Label>{`Tell us more${selectedReason && selectedReason.requires_description ? '' : ' (optional)'}`}</Label>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={2000}
              textAlignVertical="top"
              placeholderTextColor={c.muted}
              className={`h-24 py-3 ${FIELD_CLASS}`}
              editable={!busy}
              accessibilityLabel="Describe the problem"
            />
            <FieldError text={errors.description} />
          </View>

          <View>
            <Label>{`Photos${selectedReason && selectedReason.requires_evidence ? ' (required for this reason)' : ' (optional)'}`}</Label>
            <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy || uploaded.length > 0} />
            {uploaded.length > 0 ? (
              <Text className="mt-1.5 text-xs text-muted">Your photos are already uploaded; press Submit to try again.</Text>
            ) : null}
            <FieldError text={errors.photos} />
          </View>

          <View>
            <Label>Phone number we can reach you on (optional)</Label>
            <TextInput
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              maxLength={30}
              placeholderTextColor={c.muted}
              className={`h-11 ${FIELD_CLASS}`}
              editable={!busy}
              accessibilityLabel="Contact phone number"
            />
            <FieldError text={errors.contactPhone} />
          </View>

          {errors.form ? <Text className="font-sans-semibold text-sm text-error">{errors.form}</Text> : null}
        </ScrollView>

        <View className="flex-row gap-3 pt-2">
          <Pressable
            onPress={close}
            disabled={busy}
            className="h-12 items-center justify-center rounded-full border border-border px-5 active:opacity-70">
            <Text className="font-sans-semibold text-sm text-ink">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={busy}
            className="h-12 items-center justify-center rounded-full bg-primary active:opacity-90"
            style={{ flex: 1, opacity: busy ? 0.6 : 1 }}>
            <Text className="font-sans-bold text-sm text-inverse">{busy ? 'Submitting...' : `Submit ${noun} request`}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}