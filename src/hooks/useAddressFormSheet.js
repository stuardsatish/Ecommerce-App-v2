import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

/** The profile's name and phone: the starting values for a NEW address, since most people ship to themselves. */
export function useAddressPrefill() {
  const user = useSelector((state) => state.user.user);
  return { fullName: user?.name || '', phone: user?.phone || '' };
}

/**
 * Open/close state for an <AddressFormSheet>.
 *
 * The sheet keeps its form state for as long as it is mounted, so each opening
 * gets a fresh `sheetKey`; render it as
 * `<AddressFormSheet key={sheet.sheetKey} {...sheet.props} />`. Remounting on
 * open (rather than resetting in an effect) also leaves the closing animation
 * showing the form the user just left instead of a blank one. `open(address)`
 * edits that address; `open()` starts a new one.
 */
export function useAddressFormSheet() {
  const prefill = useAddressPrefill();
  const [state, setState] = useState({ visible: false, address: null, sheetKey: 0 });

  const open = useCallback(
    (address = null) => setState((s) => ({ visible: true, address, sheetKey: s.sheetKey + 1 })),
    []
  );
  const close = useCallback(() => setState((s) => ({ ...s, visible: false })), []);

  return {
    open,
    close,
    sheetKey: state.sheetKey,
    props: { visible: state.visible, address: state.address, prefill, onClose: close },
  };
}