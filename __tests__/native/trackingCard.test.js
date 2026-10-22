/**
 * Native component tests for <TrackingCard>.
 * Checklist items: SH01–SH04 (shipment tracking display, copy tracking number,
 * open tracking link, cancelled order renders nothing).
 *
 * Uses the jest-expo preset (see jest.config.js `native` project).
 */
const React = require('react');
const { render, fireEvent, waitFor } = require('@testing-library/react-native');

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ primary: '#6c47ff' }),
}));
jest.mock('@/lib/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const Clipboard = require('expo-clipboard');
const { toast } = require('@/lib/toast');
const { TrackingCard } = require('@/components/TrackingCard');

// ── Order factories ───────────────────────────────────────────────────────────
const shipment = (over = {}) => ({
  id: 's1',
  trackingNumber: 'DTDC123456',
  courierName: 'DTDC',
  trackingUrl: 'https://track.dtdc.com/DTDC123456',
  status: 'in_transit',
  events: [
    {
      id: 'e1',
      status: 'in_transit',
      description: 'Out for delivery',
      occurredAt: '2026-10-20T08:00:00Z',
      location: 'Mumbai',
      isPublic: true,
    },
  ],
  ...over,
});

const order = (over = {}) => ({
  id: 'ord-1',
  orderStatus: 'shipped',
  shipments: [shipment()],
  ...over,
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('<TrackingCard>', () => {
  it('SH01 — renders "Track your order" heading', () => {
    const { getByText } = render(<TrackingCard order={order()} />);
    expect(getByText('Track your order')).toBeTruthy();
  });

  it('SH01 — renders the courier name', () => {
    const { getAllByText } = render(<TrackingCard order={order()} />);
    // DTDC appears in both the courier name label and the tracking number text
    const dtdcElements = getAllByText(/DTDC/);
    expect(dtdcElements.length).toBeGreaterThanOrEqual(1);
  });

  it('SH01 — renders the tracking number', () => {
    const { getByText } = render(<TrackingCard order={order()} />);
    expect(getByText(/DTDC123456/)).toBeTruthy();
  });

  it('SH02 — copy tracking number button calls Clipboard.setStringAsync', async () => {
    const { getByText } = render(<TrackingCard order={order()} />);
    // The Copy button has no accessibilityLabel — it renders a 'Copy' text label
    fireEvent.press(getByText('Copy'));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('DTDC123456');
      expect(toast.success).toHaveBeenCalledWith('Tracking number copied');
    });
  });

  it('SH01 — shows at least one shipment event description', () => {
    const { getByText } = render(<TrackingCard order={order()} />);
    expect(getByText('Out for delivery')).toBeTruthy();
  });

  it('SH04 — returns null for a cancelled order', () => {
    const { toJSON } = render(<TrackingCard order={order({ orderStatus: 'cancelled' })} />);
    expect(toJSON()).toBeNull();
  });

  it('SH03 — shows "Show all" when more than 4 events exist', () => {
    const manyEvents = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      status: 'in_transit',
      description: `Event ${i}`,
      occurredAt: `2026-10-${10 + i}T08:00:00Z`,
      location: 'Mumbai',
      isPublic: true,
    }));
    const { getByText } = render(
      <TrackingCard order={order({ shipments: [shipment({ events: manyEvents })] })} />
    );
    // Button reads "Show all N updates"
    const showAll = getByText(/show all \d+ updates/i);
    expect(showAll).toBeTruthy();
  });

  it('SH03 — tapping "Show all" reveals all events', () => {
    const manyEvents = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      status: 'in_transit',
      description: `Event number ${i}`,
      occurredAt: `2026-10-${10 + i}T08:00:00Z`,
      location: 'Mumbai',
      isPublic: true,
    }));
    const { getByText } = render(
      <TrackingCard order={order({ shipments: [shipment({ events: manyEvents })] })} />
    );
    fireEvent.press(getByText(/show all \d+ updates/i));
    // The description is embedded as " · Event number 5" in a compound text node
    expect(getByText(/Event number 5/)).toBeTruthy();
  });
});
