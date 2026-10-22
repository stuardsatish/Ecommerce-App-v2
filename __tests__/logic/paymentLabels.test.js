/**
 * Logic tests for src/utils/paymentLabels.js (Ecommerce-app).
 * Mirror of the website's paymentLabels tests — both apps share the same logic.
 */
import {
  paymentMethodLabel,
  paymentStatusLabel,
  isCodPending,
  isPendingPayment,
} from '../../src/utils/paymentLabels';

describe('paymentMethodLabel', () => {
  it('COD uppercase -> friendly label', () =>
    expect(paymentMethodLabel('COD')).toBe('Cash on Delivery (COD)'));
  it('cod lowercase -> friendly label', () =>
    expect(paymentMethodLabel('cod')).toBe('Cash on Delivery (COD)'));
  it('Razorpay (any case)', () =>
    expect(paymentMethodLabel('razorpay')).toBe('Razorpay'));
  it('whatsapp', () =>
    expect(paymentMethodLabel('whatsapp')).toBe('WhatsApp'));
  it('unknown method passes through', () =>
    expect(paymentMethodLabel('UPI')).toBe('UPI'));
  it('null -> N/A', () => expect(paymentMethodLabel(null)).toBe('N/A'));
  it('empty -> N/A', () => expect(paymentMethodLabel('')).toBe('N/A'));
});

describe('paymentStatusLabel', () => {
  it('paid -> Paid', () => expect(paymentStatusLabel('paid')).toBe('Paid'));
  it('PAID uppercase', () => expect(paymentStatusLabel('PAID')).toBe('Paid'));
  it('pending (no method) -> Pending', () =>
    expect(paymentStatusLabel('pending')).toBe('Pending'));
  it('pending + cod -> Pay on Delivery', () =>
    expect(paymentStatusLabel('pending', 'cod')).toBe('Pending (Pay on Delivery)'));
  it('pending + whatsapp', () =>
    expect(paymentStatusLabel('pending', 'whatsapp')).toBe('Pending (WhatsApp)'));
  it('null -> N/A', () => expect(paymentStatusLabel(null)).toBe('N/A'));
  it('unknown passes through', () =>
    expect(paymentStatusLabel('refunded')).toBe('refunded'));
});

describe('isCodPending', () => {
  it('COD + pending -> true', () =>
    expect(isCodPending({ paymentMethod: 'cod', paymentStatus: 'pending' })).toBe(true));
  it('COD + paid -> false', () =>
    expect(isCodPending({ paymentMethod: 'cod', paymentStatus: 'paid' })).toBe(false));
  it('razorpay + pending -> false', () =>
    expect(isCodPending({ paymentMethod: 'razorpay', paymentStatus: 'pending' })).toBe(false));
  it('null -> false', () => expect(isCodPending(null)).toBe(false));
});

describe('isPendingPayment', () => {
  it('COD + pending -> true', () =>
    expect(isPendingPayment({ paymentMethod: 'cod', paymentStatus: 'pending' })).toBe(true));
  it('WhatsApp + pending -> true', () =>
    expect(isPendingPayment({ paymentMethod: 'whatsapp', paymentStatus: 'pending' })).toBe(true));
  it('razorpay + pending -> false', () =>
    expect(isPendingPayment({ paymentMethod: 'razorpay', paymentStatus: 'pending' })).toBe(false));
  it('COD + paid -> false', () =>
    expect(isPendingPayment({ paymentMethod: 'cod', paymentStatus: 'paid' })).toBe(false));
  it('null -> false', () => expect(isPendingPayment(null)).toBe(false));
});
