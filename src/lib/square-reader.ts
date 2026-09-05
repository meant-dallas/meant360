// ========================================
// Square Point of Sale (Reader) deep links
// ========================================
//
// Builds mobile-web deep links for Square's Point of Sale API, which hands
// a charge off to the Square Point of Sale app already installed and paired
// to a Square Reader on the staff member's phone. This is a different
// integration than the Web Payments SDK (card entry) or the Terminal API
// (standalone Square Terminal hardware) — see
// https://developer.squareup.com/docs/pos-api/build-mobile-web
//
// Only card payments are requested. Square's response does not report which
// tender type was actually used, so this is enforced only on a best-effort
// basis (confirmed for iOS via Square's documented `supported_tender_types`;
// Square does not publish the equivalent Android constant, so Android
// requests do not restrict tender type — staff must select "Card" in the
// Square app).
//
// Deliberately NOT process.env.NEXT_PUBLIC_SQUARE_APP_ID: that ID is
// sandboxed per-environment (Preview uses a sandbox app ID) for the Web
// Payments SDK card-entry flow. The Square Point of Sale app has no
// sandbox mode at all — it only ever recognizes a real, production
// application ID that has Point of Sale API access enabled in Square's
// Developer Dashboard, regardless of which environment (dev/preview/prod)
// initiated the request. Server-only on purpose; the deep link is always
// built server-side in createSquareReaderCheckout.
const RAW_SQUARE_READER_APP_ID = process.env.SQUARE_READER_APP_ID || '';
export const SQUARE_READER_APP_ID = RAW_SQUARE_READER_APP_ID.startsWith('your_') ? '' : RAW_SQUARE_READER_APP_ID;

export interface SquareReaderDeepLinks {
  ios: string;
  android: string;
}

// The callback_url MUST be a static, exact string pre-registered in Square's
// Developer Dashboard ("Web callback URLs") — Square validates it up front,
// before the app even lets you attempt a charge, and rejects anything that
// doesn't match a registered entry byte-for-byte. It cannot carry a
// per-transaction token in the path or query string. Correlation instead
// goes through `state` (iOS) / `REQUEST_METADATA` (Android), both of which
// Square echoes back unchanged in the callback.
export function buildSquareReaderDeepLinks(params: {
  amountCents: number;
  currency: string;
  note: string;
  callbackUrl: string;
  correlationToken: string;
}): SquareReaderDeepLinks {
  const { amountCents, currency, note, callbackUrl, correlationToken } = params;

  const iosData = {
    amount_money: {
      amount: String(amountCents),
      currency_code: currency,
    },
    callback_url: callbackUrl,
    client_id: SQUARE_READER_APP_ID,
    version: '1.3',
    notes: note,
    state: correlationToken,
    options: {
      supported_tender_types: ['CREDIT_CARD'],
    },
  };
  const ios = `square-commerce-v1://payment/create?data=${encodeURIComponent(JSON.stringify(iosData))}`;

  const android =
    'intent:#Intent;' +
    'action=com.squareup.pos.action.CHARGE;' +
    'package=com.squareup;' +
    `S.com.squareup.pos.WEB_CALLBACK_URI=${encodeURIComponent(callbackUrl)};` +
    `S.com.squareup.pos.CLIENT_ID=${encodeURIComponent(SQUARE_READER_APP_ID)};` +
    'S.com.squareup.pos.API_VERSION=v2.0;' +
    `i.com.squareup.pos.TOTAL_AMOUNT=${amountCents};` +
    `S.com.squareup.pos.CURRENCY_CODE=${encodeURIComponent(currency)};` +
    `S.com.squareup.pos.NOTE=${encodeURIComponent(note)};` +
    `S.com.squareup.pos.REQUEST_METADATA=${encodeURIComponent(correlationToken)};` +
    'end';

  return { ios, android };
}

/**
 * Parse whatever Square's Point of Sale app appends to our (static) callback
 * URL, covering both the iOS `data` JSON param and Android's discrete
 * `com.squareup.pos.*` query params — including the echoed-back correlation
 * token, since it's no longer available from the URL itself.
 */
export function parseSquareReaderCallback(searchParams: URLSearchParams): {
  token: string | null;
  transactionId: string | null;
  errorCode: string | null;
} {
  const iosData = searchParams.get('data');
  if (iosData) {
    try {
      const parsed = JSON.parse(iosData) as {
        transaction_id?: string;
        error_code?: string;
        state?: string;
      };
      return {
        token: parsed.state || null,
        transactionId: parsed.transaction_id || null,
        errorCode: parsed.error_code || null,
      };
    } catch {
      return { token: null, transactionId: null, errorCode: 'invalid_callback_data' };
    }
  }

  const serverTransactionId = searchParams.get('com.squareup.pos.SERVER_TRANSACTION_ID');
  const errorCode = searchParams.get('com.squareup.pos.ERROR_CODE');
  const token = searchParams.get('com.squareup.pos.REQUEST_METADATA');
  return {
    token: token || null,
    transactionId: serverTransactionId || null,
    errorCode: errorCode || null,
  };
}
