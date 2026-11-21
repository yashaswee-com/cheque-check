# रिपोर्ट और एक्सपोर्ट देखें

Reports और exports Premium tools हैं। ये active business के recorded cheque data का सार देते हैं और review/share के लिए download बनाते हैं।

## Report page देखें

1. **Reports** खोलें।
2. Selected business जाँचें।
3. Statistics date range चुनें।
4. Status totals, pending amounts, distribution और recent preview देखें।

Preview में अधिकतम 10 recent cheques होते हैं। पूरा authorized history export से मिलता है।

Statistics date filter on-screen summary को नियंत्रित करता है। यह full export को अपने-आप सीमित नहीं करता।

## Export formats

**Export** से चुनें:

- **CSV:** background job के माध्यम से पूरा selected-business data।
- **JSON:** background job के माध्यम से पूरा selected-business data।
- **PDF:** browser में तैयार Business Cheque Overview।
- **Excel:** authorised data से workbook।

Large CSV/JSON job queued, running, ready या failed हो सकता है। काम जारी रखें और **Background exports** में refresh/download करें।

## Business Cheque Overview PDF

PDF active business की पूरी exportable history का owner-focused report है। इसमें हो सकते हैं:

- pending receivables और payables;
- cleared और bounced values अलग;
- today, next 7-day, next 30-day और overdue windows;
- सबसे बड़े pending parties;
- monthly activity और month comparison;
- paginated cheque register।

Report आपकी भाषा, currency, date format और time zone से बनता है। इसमें names, cheque numbers, bank names और amounts हो सकते हैं। Overview से account numbers, contact details और internal notes हटते हैं, फिर भी file private business data है।

## संख्याओं का अर्थ

- **Pending:** recorded Issued या Received cheques।
- **Cleared/Bounced:** pending totals से अलग।
- **Overdue:** local today से पहले की pending cheque date।
- Bounced exposure अलग दिखता है।
- Amount display currency में हैं; exchange conversion नहीं।
- Monthly activity cheque dates और current status पर है, historical settlement event पर नहीं।

Report bank balance, verified debt, clearance proof या financial advice नहीं है।

## Share करने से पहले

- Active business और current statuses जाँचें।
- Inward visibility intended scope से match कराएँ।
- Party और bank names review करें।
- Download सुरक्षित रखें।
- बाहर share करने से पहले गलत/private data हटाएँ या सही करें।

## Export failure

1. Premium access active है जाँचें।
2. Connection जाँचकर retry करें।
3. Background job हो तो **Export jobs** refresh करें।
4. Failed job के लिए नया export request करें।
5. Private internal link share न करें।
