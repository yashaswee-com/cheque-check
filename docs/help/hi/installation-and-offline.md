# ऐप इंस्टॉल और कनेक्शन समस्या

Cheque Check modern browser में चलता है और web app की तरह install हो सकता है। App store ज़रूरी नहीं है।

## Settings से install करें

1. **Settings** खोलें।
2. Profile के नीचे **Install ChequeCheck** card देखें।
3. Browser prompt मिलने पर **Install** चुनें।
4. Browser confirmation की प्रतीक्षा करें।

Install होने के बाद card छिप सकता है। Installation से push notification permission अपने-आप चालू नहीं होती।

## Manual installation

- **iPhone/iPad:** Safari में **Share → Add to Home Screen**, फिर installed app खोलें।
- **Android:** browser menu में **Install app** या **Add to Home screen** चुनें।
- **macOS Safari:** supported versions में **File → Add to Dock** हो सकता है।
- **अन्य browser:** address bar या menu में Install देखें।

Install option browser और operating system पर निर्भर है।

## Install के बाद push चालू करें

iOS में installed app खोलें। फिर **Settings → Notifications → Push on this device** से browser permission दें।

Installation और notification permission अलग काम हैं।

## Offline behavior

Service worker install और activate होने के बाद failed page navigation पर generic offline/retry page दिख सकता है।

यह:

- cheque, party, account या report data cache नहीं करता;
- offline edit को बाद में sync नहीं करता;
- offline में API, download या sign-in नहीं चलाता;
- first visit का offline काम करने की guarantee नहीं देता।

पहले से खुला page दिखे तब भी data या save पर भरोसा करने से पहले reconnect करें।

## Page load न हो

1. Device connection जाँचें।
2. Offline page पर **Retry** या requested page reload करें।
3. Browser/service-worker update के बाद app दोबारा खोलें।
4. बार-बार fail हो तो supported browser और in-app support विकल्प उपयोग करें।

Original uncertain request complete नहीं हुआ मानकर नया cheque, scan या payment शुरू न करें।
