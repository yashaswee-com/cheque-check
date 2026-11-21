# चेक मैनेज करें

Cheque Check में चेक किसी party और business account के बीच payment record होता है। Free में Issued cheques बन सकते हैं; Received/Inward tracking Premium में है, लेकिन पुराने received records edit किए जा सकते हैं।

## चेक बनाएँ

1. Active business जाँचें।
2. **Cheques → New Cheque** खोलें।
3. उपलब्ध हो तो **Issued** या **Received** चुनें।
4. Party चुनें या बनाएँ।
5. Bank account चुनें या बनाएँ।
6. छह अंकों का cheque number, cheque date, positive amount और expected deposit date भरें।
7. Optional notes और tags जोड़ें।
8. Review करके सेव करें।

Issued cheque में party recipient होती है। Received cheque में party payer होती है।

अधूरी जानकारी पर form से बाहर जाते समय Draft save या discard विकल्प मिलता है। देखें: [चेक स्कैन और ड्राफ्ट](scanning-and-drafts.md)

## फोटो से चेक बनाएँ

Dashboard और cheque form से photo scanner खुलता है। AI फ़ील्ड सुझाता है, लेकिन final review आप करते हैं।

- एक साफ़ cheque-front JPEG, PNG या WebP उपयोग करें।
- अधिकतम 10 MB और 16 megapixel।
- Processing से पहले AI/privacy disclosure स्वीकार करें।
- नाम, तारीख, cheque number, amount, party और account Publish से पहले जाँचें।
- Scanning उपलब्ध न हो या credits न हों तो manual entry चुनें।

## मौजूदा status

- **Issued:** outward cheque अभी cleared नहीं है।
- **Received:** inward cheque अभी cleared नहीं है।
- **Cleared:** recorded payment outcome confirm हुआ।
- **Bounced:** cheque dishonour हुआ।

List/filter में Issued और Received को **Pending** समूह में दिखाया जा सकता है। Cheque Check बैंक clearance या balance verify नहीं करता।

## चेक update करें

Cheque detail खोलें, ज़रूरत हो तो audit log देखें, **Edit Cheque** चुनें, correction करें और सेव करें।

आम updates:

- name, date, number, amount, account या notes सही करना;
- image बदलना;
- Cleared या Bounced status करना;
- tags बदलना।

Detail page में recorded changes का chronological audit log रहता है।

## Search, sort और filter

**Cheques** में search या **Sort & Filter** उपयोग करें। उपलब्ध filters:

- status या direction;
- party type, party, tag या bank account;
- cheque date और expected deposit-date range;
- amount range;
- newest, oldest, date या amount sorting।

Filter sheet बदलाव के साथ matching cheque count दिखाती है। कुछ न मिले तो search, filter count और checked business बताया जाता है तथा **Clear search & filters** विकल्प मिलता है।

## Duplicate number

एक खाते में वही cheque number होने पर app warning दिखाता है। AI scan से warning आए तो publish से पहले duplicate review करें और जानबूझकर अलग record बनाना हो तभी confirm करें।

## Premium actions

Premium tools दे सकते हैं:

- duplicate cheque to draft;
- bulk CSV/Excel import;
- reusable cheque templates;
- saved filter views;
- reviewed bulk status changes;
- saved print layouts के साथ cheque printing;
- party SMS preparation.

हर tool preview या confirmation देता है। Confirm करने से पहले affected records देखें।

## चेक delete करें

गलत बना record या वास्तव में अनावश्यक रिकॉर्ड ही delete करें। Bounced या Cleared दिखाने के लिए delete नहीं, status update करें।

## अच्छी आदतें

- चेक समय पर दर्ज करें।
- Active business, party, account, amount और dates जाँचें।
- Cheque number के leading zeros बनाए रखें।
- Outcome पता होने पर status बदलें।
- पुराने और bounced records follow-up/reporting के लिए रखें।
