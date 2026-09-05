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

const RAW_SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID || '';
export const SQUARE_READER_APP_ID = RAW_SQUARE_APP_ID.startsWith('your_') ? '' : RAW_SQUARE_APP_ID;

export interface SquareReaderDeepLinks {
  ios: string;
  android: string;
}

export function buildSquareReaderDeepLinks(params: {
  amountCents: number;
  currency: string;
  note: string;
  callbackUrl: string;
}): SquareReaderDeepLinks {
  const { amountCents, currency, note, callbackUrl } = params;

  const iosData = {
    amount_money: {
      amount: String(amountCents),
      currency_code: currency,
    },
    callback_url: callbackUrl,
    client_id: SQUARE_READER_APP_ID,
    version: '1.3',
    notes: note,
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
    'end';

  return { ios, android };
}

/**
 * Parse whatever Square's Point of Sale app appends to our callback URL,
 * covering both the iOS `data` JSON param and Android's discrete
 * `com.squareup.pos.*` query params.
 */
export function parseSquareReaderCallback(searchParams: URLSearchParams): {
  transactionId: string | null;
  errorCode: string | null;
} {
  const iosData = searchParams.get('data');
  if (iosData) {
    try {
      const parsed = JSON.parse(iosData) as {
        transaction_id?: string;
        error_code?: string;
      };
      return {
        transactionId: parsed.transaction_id || null,
        errorCode: parsed.error_code || null,
      };
    } catch {
      return { transactionId: null, errorCode: 'invalid_callback_data' };
    }
  }

  const serverTransactionId = searchParams.get('com.squareup.pos.SERVER_TRANSACTION_ID');
  const errorCode = searchParams.get('com.squareup.pos.ERROR_CODE');
  return {
    transactionId: serverTransactionId || null,
    errorCode: errorCode || null,
  };
}
