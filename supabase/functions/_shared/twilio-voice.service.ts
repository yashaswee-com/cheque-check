export type ProviderCallResult =
  | { success: true; sid: string }
  | { success: false; error: string; uncertain: boolean }

export interface TwilioConfig {
  accountSid: string
  authToken: string
  fromNumber: string
}

export class TwilioVoiceService {
  constructor(private config: TwilioConfig) {}

  async initiateCall(to: string, twiml: string): Promise<ProviderCallResult> {
    const { accountSid, authToken, fromNumber } = this.config
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Twiml: twiml,
        }),
        signal: AbortSignal.timeout(10_000),
      })

      const data: unknown = await response.json()
      if (response.ok) {
        const sid =
          typeof data === 'object' &&
          data &&
          'sid' in data &&
          typeof data.sid === 'string' &&
          data.sid.length > 0
            ? data.sid
            : undefined
        return sid
          ? { success: true, sid }
          : {
              success: false,
              error: 'Provider accepted a call without a usable identifier',
              uncertain: true,
            }
      } else {
        const message =
          typeof data === 'object' && data && 'message' in data
            ? String(data.message)
            : 'Twilio rejected the reminder call'
        return {
          success: false,
          error: message,
          uncertain: response.status >= 500,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        uncertain: true,
      }
    }
  }

  generateTwiML(message: string, language: string = 'en'): string {
    // 'Polly.Aditi' is an Indian English/Hindi bilingual voice, perfect for both.
    const twilioLang = language === 'hi' ? 'hi-IN' : 'en-IN'
    const goodbye = language === 'hi' ? 'धन्यवाद।' : 'Goodbye.'

    const escapedMessage = this.escapeXml(message)
    const escapedGoodbye = this.escapeXml(goodbye)

    return `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say voice="Polly.Aditi" language="${twilioLang}">${escapedMessage}</Say>
        <Pause length="1"/>
        <Say voice="Polly.Aditi" language="${twilioLang}">${escapedGoodbye}</Say>
    </Response>`
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
  }
}
