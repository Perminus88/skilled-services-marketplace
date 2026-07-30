// src/lib/mpesa/b2c.ts
// Triggers a real B2C (Business-to-Customer) payout via Daraja v3.
// This moves real money in production — treat changes here with the same
// care as the STK push code, if not more (B2C has no customer-side PIN
// confirmation step; once accepted, it's moving).

import { getDarajaAccessToken } from "./auth";
import { normalizeMpesaPhone } from "./stkPush";

const B2C_URL = "https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest";

interface B2CPayoutParams {
  phone:                    string;
  amount:                   number;
  remarks:                  string;
  originatorConversationId: string; // caller-generated, used to match the async result callback
}

interface B2CInitiateResponse {
  ConversationID:            string;
  OriginatorConversationID:  string;
  ResponseCode:              string;
  ResponseDescription:       string;
}

function deriveB2CCallbackUrls(): { resultUrl: string; timeoutUrl: string } {
  const stkCallbackUrl = process.env.MPESA_CALLBACK_URL;
  if (!stkCallbackUrl) {
    throw new Error("Missing MPESA_CALLBACK_URL in environment variables");
  }

  const origin = new URL(stkCallbackUrl).origin;
  return {
    resultUrl:  `${origin}/api/mpesa/b2c/result`,
    timeoutUrl: `${origin}/api/mpesa/b2c/timeout`,
  };
}

export async function triggerB2CPayout(params: B2CPayoutParams): Promise<B2CInitiateResponse> {
  const initiatorName      = process.env.MPESA_B2C_INITIATOR_NAME;
  const securityCredential = process.env.MPESA_B2C_SECURITY_CREDENTIAL;
  const shortcode          = process.env.MPESA_B2C_SHORTCODE;

  if (!initiatorName || !securityCredential || !shortcode) {
    throw new Error(
      "Missing MPESA_B2C_INITIATOR_NAME, MPESA_B2C_SECURITY_CREDENTIAL, or MPESA_B2C_SHORTCODE in environment variables"
    );
  }

  const normalizedPhone = normalizeMpesaPhone(params.phone);
  if (!normalizedPhone) {
    throw new Error(`"${params.phone}" is not a valid Kenyan phone number for M-Pesa.`);
  }

  // B2C is whole-shilling only, same as STK, with a documented sandbox
  // minimum of Ksh 10.
  const amount = Math.round(params.amount);
  if (amount < 10) {
    throw new Error(`Payout amount (KES ${amount}) is below M-Pesa's minimum of KES 10.`);
  }

  const { resultUrl, timeoutUrl } = deriveB2CCallbackUrls();
  const token = await getDarajaAccessToken();

  const response = await fetch(B2C_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      OriginatorConversationID: params.originatorConversationId,
      InitiatorName:            initiatorName,
      SecurityCredential:       securityCredential,
      CommandID:                "BusinessPayment",
      Amount:                   amount,
      PartyA:                   shortcode,
      PartyB:                   normalizedPhone,
      Remarks:                  params.remarks.slice(0, 100),
      QueueTimeOutURL:          timeoutUrl,
      ResultURL:                resultUrl,
      Occassion:                "", // Daraja's own spelling, not a typo on our end
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.ResponseCode !== "0") {
    console.error("PAYOUT ERROR LOG: B2C initiate request failed:", data);
    throw new Error(
      data.errorMessage || data.ResponseDescription || "B2C payout request failed."
    );
  }

  return data as B2CInitiateResponse;
}