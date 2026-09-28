// src/lib/pricing.ts
//
// Single source of truth for platform fees. Values come from the signed
// Terms & Conditions, Section 8 (Payments, Fees & Commission):
//   - Platform commission: 13% of job value, taken from the artisan's payout
//   - Client booking fee: KES 75 flat per booking, added to the client's charge
//
// Commission is calculated on the job price ONLY. The booking fee is separate
// platform revenue and is never part of the commission base.

export const COMMISSION_RATE = 0.13;
export const CLIENT_BOOKING_FEE_KES = 75;

// What the client pays via STK push: job price plus the flat booking fee.
// M-Pesa only accepts whole shillings, so the job price is rounded first.
export function computeClientTotal(jobPrice: number): number {
  return Math.round(jobPrice) + CLIENT_BOOKING_FEE_KES;
}

// Commission taken from the artisan's side, in whole shillings.
export function computeCommission(jobPrice: number): number {
  return Math.round(jobPrice * COMMISSION_RATE);
}