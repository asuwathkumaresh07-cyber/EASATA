// Everyday wording for model features, families and bands (used in Plain English mode).

export const FEATURE_PLAIN: Record<string, string> = {
  hour_of_day: 'Time of day',
  is_weekend: 'Weekend payment',
  is_night_transaction: 'Made late at night',
  country: 'Country',
  city: 'City',
  merchant_category: 'Type of shop',
  payment_method: 'How it was paid',
  device_type: 'Device used',
  customer_age: "Customer's age",
  credit_score: 'Credit score',
  account_age_years: 'How old the account is',
  account_balance: 'Account balance',
  transaction_amount: 'Payment amount',
  num_prev_transactions: 'Number of past payments',
  transaction_freq_monthly: 'Payments per month',
  distance_from_home_km: 'Distance from home',
  time_since_last_txn_hrs: 'Time since last payment',
  is_international: 'Paid abroad',
  failed_attempts: 'Wrong PIN / login tries',
  pin_changed_recently: 'PIN changed recently',
  log_amount: 'Payment size',
  amount_to_balance: 'Share of balance spent',
  cust_prior_txns: 'Payments seen before',
  amt_vs_cust_mean: 'Bigger than usual for them',
  cust_txns_1h: 'Payments in the last hour',
  cust_amt_1h: 'Money spent in the last hour',
  cust_txns_24h: 'Payments in the last day',
  cust_amt_24h: 'Money spent in the last day',
  cust_txns_7d: 'Payments in the last week',
  cust_amt_7d: 'Money spent in the last week',
  hrs_since_cust_prev: 'Hours since their last payment',
  hour_band_share_cust: 'How often they pay at this hour',
  unusual_hour_for_cust: 'Unusual hour for them',
  night_share_cust: 'How often they pay at night',
  weekday_share_cust: 'How often they pay on this day',
  unusual_day_for_cust: 'Unusual day for them',
  amt_z_cust: 'How far from their normal amount',
  new_city_for_cust: 'First time in this city',
  new_country_for_cust: 'First time in this country',
  new_device_type_for_cust: 'New device for them',
  new_payment_method_for_cust: 'New way of paying for them',
  new_merchant_category_for_cust: 'New type of shop for them',
  limited_history: 'Little history to compare',
};

export const feat = (f: string, plain: boolean) => (plain ? FEATURE_PLAIN[f] ?? f.replace(/_/g, ' ') : f);

export const FAMILY_PLAIN: Record<string, string> = {
  security: 'Security signs',
  amount: 'Money',
  profile: 'Account & shop',
  location: 'Place',
  velocity: 'Speed of spending',
  time: 'Timing',
};

export const FAMILY_DESC: Record<string, string> = {
  security: 'wrong PIN tries, PIN changes, new devices',
  amount: 'size of the payment vs balance and habits',
  profile: 'type of shop, account age, credit score',
  location: 'abroad, far from home, new city',
  velocity: 'many payments in a short time',
  time: 'late night, unusual hour or day',
};

export const BAND_PLAIN: Record<string, { title: string; text: string }> = {
  PROCEED: { title: 'Let it through', text: 'Looks normal. The payment goes ahead.' },
  STEP_UP: { title: 'Ask for a code', text: 'A bit unusual. The customer confirms with a one-time code.' },
  HOLD: { title: 'Pause and ask', text: 'Unusual. We pause it and ask the customer "Was this you?"' },
  BLOCK: { title: 'Stop the payment', text: 'Very suspicious. Stopped, customer asked, and a person reviews it.' },
};

/** "about 1 in 4" style phrasing of a probability. */
export function oneIn(p: number): string {
  if (p <= 0) return 'almost no';
  if (p >= 0.5) return `about ${Math.round(p * 10)} in 10`;
  const n = Math.round(1 / p);
  return `about 1 in ${n}`;
}

export function strength(v: number): string {
  const a = Math.abs(v);
  if (a >= 1) return 'strong';
  if (a >= 0.35) return 'moderate';
  if (a >= 0.1) return 'slight';
  return 'tiny';
}

const FLAG = /^(is_|new_|unusual_|pin_changed|limited_history)/;
/** Show 0/1 flags as no/yes in Plain English. */
export const plainVal = (f: string, v: unknown) => (FLAG.test(f) && (v === 0 || v === 1 || v === '0' || v === '1') ? (Number(v) ? 'yes' : 'no') : String(v));
