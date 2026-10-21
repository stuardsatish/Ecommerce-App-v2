import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { EvidenceGallery } from '@/components/returns/EvidenceGallery';
import { PhotoPicker, RefundNotice, RequestStatusChip, ToneChip, toneClass } from '@/components/returns/RequestBits';
import { useThemeColors } from '@/hooks/useThemeColors';
import { confirmAction } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { returnsService } from '@/services/returns';
import { customerReplacement } from '@/utils/exchangeModel';
import {
  EVIDENCE_MAX_FILES,
  canCustomerCancel,
  canCustomerRespond,
  canSubmitReturnTracking,
  itemStatusLabel,
  requestProgress,
  requestStatusMeta,
  requestTypeLabel,
} from '@/utils/requestModel';
import { shipmentStatusMeta } from '@/utils/shipmentModel';

/**
 * One return / exchange request as the CUSTOMER sees it: status, progress, the items with their decisions, the instructions and
 * tracking of the return parcel, the photos and the history - plus the few actions the customer may take (cancel, answer a
 * question, tell us how a parcel was sent). Twin of the website's features/returns/RequestCard.jsx.
 *
 * `order` is only used for its `shipments` (the return parcels of this request: `shipments` whose `requestId` is this request's id).
 * `replacement` = { fulfilment, adjustment, shipment } of an EXCHANGE (exchangeModel.buildReplacementMap): what is being sent instead,
 * where it is and the price difference.
 */

const METHOD_LABEL = {
  courier_pickup: 'Courier pickup',
  customer_arranged: 'Send it yourself',
  manual: 'Hand it over / arranged with us',
};

const fmtDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};
const fmtDateTime = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime())
    ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
};

const INPUT_CLASS = 'rounded-xl border border-border bg-surface-muted px-3 font-sans text-sm text-ink';

function SectionLabel({ children }) {
  return <Text className="mb-1.5 font-sans-bold text-[11px] uppercase tracking-wide text-body">{children}</Text>;
}

/** "Send it yourself": the customer tells us which courier / post service and the tracking number of the parcel. */
function TrackingForm({ request, onDone }) {
  const c = useThemeColors();
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (busy) return;
    if (!courierName.trim()) {
      setError('Enter the courier or post service you used');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await returnsService.submitReturnTracking({
        requestId: request.id,
        courierName: courierName.trim(),
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim(),
      });
      toast.success('Thank you - we have noted your parcel');
      onDone?.();
    } catch (err) {
      setError(err.message || 'Could not save the details');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2.5 rounded-xl border border-border p-3">
      <Text className="font-sans-bold text-[13px] text-ink">Sent the parcel? Tell us how</Text>
      <View className="gap-1">
        <Text className="font-sans-semibold text-xs text-body">Courier / post service</Text>
        <TextInput
          value={courierName}
          onChangeText={setCourierName}
          maxLength={80}
          placeholderTextColor={c.muted}
          className={`h-11 ${INPUT_CLASS}`}
          editable={!busy}
        />
      </View>
      <View className="gap-1">
        <Text className="font-sans-semibold text-xs text-body">Tracking number</Text>
        <TextInput
          value={trackingNumber}
          onChangeText={setTrackingNumber}
          maxLength={80}
          autoCapitalize="characters"
          placeholderTextColor={c.muted}
          className={`h-11 ${INPUT_CLASS}`}
          editable={!busy}
        />
      </View>
      <View className="gap-1">
        <Text className="font-sans-semibold text-xs text-body">Tracking link (optional)</Text>
        <TextInput
          value={trackingUrl}
          onChangeText={setTrackingUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={c.muted}
          className={`h-11 ${INPUT_CLASS}`}
          editable={!busy}
        />
      </View>
      {error ? <Text className="font-sans-medium text-xs text-error">{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy}
        className="h-11 items-center justify-center rounded-full bg-primary active:opacity-90"
        style={{ opacity: busy ? 0.6 : 1 }}>
        <Text className="font-sans-bold text-sm text-inverse">{busy ? 'Saving...' : 'Save shipping details'}</Text>
      </Pressable>
    </View>
  );
}

/** The seller asked for more information: a message and / or more photos. */
function ReplyForm({ request, user, onDone }) {
  const c = useThemeColors();
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const room = Math.max(0, EVIDENCE_MAX_FILES - request.evidence.length);

  const submit = async () => {
    if (busy) return;
    if (!message.trim() && photos.length === 0) {
      setError('Write a message or add a photo');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const stored = photos.length
        ? await returnsService.uploadEvidence({
            uid: user.uid,
            requestId: request.id,
            startIndex: request.evidence.length,
            files: photos.map((p) => p.file),
          })
        : [];
      try {
        await returnsService.respond(request.id, message.trim(), stored);
      } catch (err) {
        await returnsService.discardEvidence(stored.map((s) => s.path));
        throw err;
      }
      toast.success('Your answer was sent');
      onDone?.();
    } catch (err) {
      setError(err.message || 'Could not send your answer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2.5 rounded-xl border border-warning-border bg-warning-subtle p-3">
      <Text className="font-sans-bold text-[13px] text-ink">We need a little more information</Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={3}
        maxLength={1000}
        textAlignVertical="top"
        placeholder="Your answer"
        placeholderTextColor={c.muted}
        className={`h-24 py-3 ${INPUT_CLASS}`}
        editable={!busy}
        accessibilityLabel="Your answer"
      />
      {room > 0 ? <PhotoPicker photos={photos} max={room} onChange={setPhotos} disabled={busy} /> : null}
      {error ? <Text className="font-sans-medium text-xs text-error">{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy}
        className="h-11 items-center justify-center rounded-full bg-primary active:opacity-90"
        style={{ opacity: busy ? 0.6 : 1 }}>
        <Text className="font-sans-bold text-sm text-inverse">{busy ? 'Sending...' : 'Send answer'}</Text>
      </Pressable>
    </View>
  );
}

/** One return parcel: courier, tracking number (copy), pickup reference, link to the courier site, status. */
function ParcelRow({ parcel }) {
  const c = useThemeColors();
  const meta = shipmentStatusMeta(parcel.status);
  const copy = async (text) => {
    try {
      await Clipboard.setStringAsync(String(text));
      toast.success('Tracking number copied');
    } catch {
      toast.error('Could not copy the tracking number');
    }
  };
  const openLink = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.error('Could not open the tracking link');
    }
  };
  return (
    <View className="mt-2 gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-sans-semibold text-[13px] text-ink">{parcel.courierName || 'Courier'}</Text>
        <ToneChip tone={meta.tone} label={meta.label} />
      </View>
      {parcel.trackingNumber ? (
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <Text selectable className="font-sans-medium text-[13px] text-ink">
            {parcel.trackingNumber}
          </Text>
          <Pressable
            onPress={() => copy(parcel.trackingNumber)}
            hitSlop={8}
            className="flex-row items-center gap-1 active:opacity-60">
            <Icon name="copy" size={13} color={c.body} />
            <Text className="font-sans-semibold text-xs text-body">Copy</Text>
          </Pressable>
          {parcel.trackingUrl ? (
            <Pressable
              onPress={() => openLink(parcel.trackingUrl)}
              hitSlop={8}
              className="flex-row items-center gap-1 active:opacity-60">
              <Text className="font-sans-bold text-xs text-link">Track</Text>
              <Icon name="external-link" size={13} color={c.link} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {parcel.pickupReference ? <Text className="text-xs text-body">Pickup ref {parcel.pickupReference}</Text> : null}
    </View>
  );
}

/**
 * "Your replacement" of an exchange: what is being sent, where it is (courier + tracking once it ships) and the price difference in plain words.
 * `view` = exchangeModel.customerReplacement(request, bundle); renders nothing without one. Twin of ReplacementNotice in the website's RequestBits.jsx.
 */
function ReplacementNotice({ view }) {
  if (!view) return null;
  const adj = view.adjustment;
  const [abg, afg] = adj ? toneClass(adj.tone) : ['', ''];
  const t = view.tracking;
  return (
    <View className="rounded-xl border border-border p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-sans-bold text-[13px] text-ink">{view.headline}</Text>
        <ToneChip tone={view.status.tone} label={view.status.label} />
      </View>
      {view.lines.map((l) => (
        <Text key={l.id} className="mt-1 text-[13px] text-ink">
          {l.text}
        </Text>
      ))}
      {t ? <ParcelRow parcel={{ courierName: t.courier, trackingNumber: t.number, trackingUrl: t.url, status: t.status }} /> : null}
      {adj ? (
        <View className={`mt-2.5 gap-0.5 rounded-lg p-3 ${abg}`}>
          <Text className={`font-sans-bold text-[13px] ${afg}`}>{adj.headline}</Text>
          <Text className="text-[13px] text-ink">{adj.detail}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function RequestCard({ request, order, refunds = [], replacement = null, user, onChanged }) {
  const c = useThemeColors();
  const [open, setOpen] = useState(!requestStatusMeta(request.status).final);
  const [busy, setBusy] = useState(false);
  const meta = requestStatusMeta(request.status);
  const steps = requestProgress(request);
  // the RETURN parcels (direction 'return'); the replacement parcel travels inside `replacement` (exchangeModel.buildReplacementMap)
  const parcels = (order?.shipments || []).filter((s) => s.requestId === request.id && s.direction !== 'replacement');
  const replacementView = customerReplacement(request, replacement);

  const cancel = async () => {
    if (busy) return;
    const yes = await confirmAction({
      title: 'Cancel this request?',
      message: 'It will be withdrawn. You can submit a new one later while the period is open.',
      confirmText: 'Yes, cancel it',
    });
    if (!yes) return;
    setBusy(true);
    try {
      await returnsService.cancel(request.id);
      toast.success('Request cancelled');
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Could not cancel the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="rounded-xl border border-border bg-surface p-4">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between gap-3 active:opacity-80">
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text className="font-sans-bold text-[14px] text-ink">
            {requestTypeLabel(request.type)} {request.requestNo}
          </Text>
          <Text className="text-xs text-body">
            Submitted {fmtDate(request.createdAt)} · {request.items.length} item{request.items.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <RequestStatusChip status={request.status} />
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.body} />
        </View>
      </Pressable>

      {open ? (
        <View className="mt-3.5 gap-3.5">
          {!meta.final || request.status === 'closed' ? (
            <View className="flex-row gap-1">
              {steps.map((s) => (
                <View key={s.key} className="flex-1 items-center" style={{ minWidth: 0 }}>
                  <View
                    className={`h-1 w-full rounded-full ${
                      s.stopped ? 'bg-error' : s.done ? 'bg-primary' : s.current ? 'bg-accent' : 'bg-border'
                    }`}
                  />
                  <Text
                    numberOfLines={1}
                    className={`mt-1 text-center text-[10px] ${
                      s.current ? 'font-sans-bold text-ink' : s.done ? 'text-ink' : 'text-muted'
                    }`}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {request.customerNote ? (
            <Text className="rounded-lg bg-surface-muted px-3 py-2.5 text-[13px] text-ink">{request.customerNote}</Text>
          ) : null}

          <View className="gap-2">
            {request.items.map((it) => (
              <View key={it.id} className="flex-row items-start justify-between gap-3">
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text className="font-sans-semibold text-[13px] text-ink">
                    {it.title}
                    {it.variantName ? ` · ${it.variantName}` : ''}
                    <Text className="font-sans text-muted">{` x${it.quantity}`}</Text>
                  </Text>
                  {it.decisionNote ? <Text className="text-xs text-body">{it.decisionNote}</Text> : null}
                  {it.inspectionNote ? <Text className="text-xs text-body">{it.inspectionNote}</Text> : null}
                </View>
                <Text
                  className={`font-sans-semibold text-xs ${
                    it.status === 'rejected' || it.status === 'failed' ? 'text-error' : 'text-body'
                  }`}>
                  {itemStatusLabel(it.status)}
                </Text>
              </View>
            ))}
          </View>

          {request.returnMethod ? (
            <View className="rounded-xl border border-border p-3">
              <Text className="font-sans-bold text-[13px] text-ink">
                How to return it: {METHOD_LABEL[request.returnMethod] || request.returnMethod}
              </Text>
              {request.returnInstructions ? (
                <Text className="mt-1 text-[13px] text-body">{request.returnInstructions}</Text>
              ) : null}
              {parcels.map((s) => (
                <ParcelRow key={s.id} parcel={s} />
              ))}
            </View>
          ) : null}

          <ReplacementNotice view={replacementView} />
          <RefundNotice refunds={refunds} />

          {canCustomerRespond(request) ? <ReplyForm request={request} user={user} onDone={onChanged} /> : null}
          {canSubmitReturnTracking(request) ? <TrackingForm request={request} onDone={onChanged} /> : null}

          {request.evidence.length ? (
            <View>
              <SectionLabel>Your photos</SectionLabel>
              <EvidenceGallery paths={request.evidence.map((e) => e.path)} />
            </View>
          ) : null}

          {request.events.length ? (
            <View>
              <SectionLabel>History</SectionLabel>
              {request.events
                .filter((e) => !e.itemId)
                .map((e) => (
                  <Text key={e.id} className="pb-1.5 text-xs text-body">
                    <Text className="font-sans-bold text-ink">{e.to ? requestStatusMeta(e.to).label : 'Update'}</Text>
                    {` · ${fmtDateTime(e.createdAt)}${e.note ? ` · ${e.note}` : ''}`}
                  </Text>
                ))}
            </View>
          ) : null}

          {canCustomerCancel(request) ? (
            <Pressable
              onPress={cancel}
              disabled={busy}
              accessibilityRole="button"
              className="h-11 items-center justify-center rounded-full border border-border active:opacity-70"
              style={{ opacity: busy ? 0.6 : 1 }}>
              <Text className="font-sans-semibold text-sm text-error">{busy ? 'Cancelling...' : 'Cancel this request'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}