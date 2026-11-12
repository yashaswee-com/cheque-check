const offlineMessages = {
  en: {
    lang: 'en',
    language: 'Language',
    title: "You're offline",
    description:
      'ChequeCheck could not reach the network. Check your connection, then retry to return to the page you requested.',
    offline: 'No network connection. You can retry whenever you are ready.',
    online:
      'Your device reports a connection. Press Retry to reconnect to ChequeCheck.',
    privacy:
      'Your account and cheque data are not stored on this offline page. Changes cannot be saved here.',
    retry: 'Retry',
  },
  hi: {
    lang: 'hi',
    language: 'भाषा',
    title: 'आप ऑफ़लाइन हैं',
    description:
      'ChequeCheck नेटवर्क से नहीं जुड़ सका। अपना कनेक्शन जाँचें, फिर अनुरोधित पेज पर लौटने के लिए फिर कोशिश करें।',
    offline: 'नेटवर्क कनेक्शन नहीं है। तैयार होने पर फिर कोशिश करें।',
    online:
      'डिवाइस कनेक्शन दिखा रहा है। ChequeCheck से जुड़ने के लिए फिर कोशिश करें दबाएँ।',
    privacy:
      'आपके खाते और चेक का डेटा इस ऑफ़लाइन पेज पर संग्रहीत नहीं है। यहाँ बदलाव सहेजे नहीं जा सकते।',
    retry: 'फिर कोशिश करें',
  },
  'hi-en': {
    lang: 'en',
    language: 'Bhasha',
    title: 'Aap offline hain',
    description:
      'ChequeCheck network se connect nahi ho saka. Connection check karein, phir apne requested page par lautne ke liye retry karein.',
    offline: 'Network connection nahi hai. Taiyaar hone par retry karein.',
    online:
      'Device connection dikha raha hai. ChequeCheck se judne ke liye Retry dabayein.',
    privacy:
      'Aapke account aur cheque ka data is offline page par store nahi hai. Yahan changes save nahi ho sakte.',
    retry: 'Retry',
  },
}

const languageSelect = document.getElementById('offline-language')
languageSelect.value = 'hi-en'

function renderOfflinePage() {
  const copy = offlineMessages[languageSelect.value]
  document.documentElement.lang = copy.lang
  document.title = `${copy.title} | ChequeCheck`
  document.getElementById('language-label').textContent = copy.language
  document.getElementById('offline-title').textContent = copy.title
  document.getElementById('offline-description').textContent = copy.description
  document.getElementById('offline-status').textContent = navigator.onLine
    ? copy.online
    : copy.offline
  document.getElementById('offline-privacy').textContent = copy.privacy
  document.getElementById('offline-retry').textContent = copy.retry
}

languageSelect.addEventListener('change', renderOfflinePage)
window.addEventListener('online', renderOfflinePage)
window.addEventListener('offline', renderOfflinePage)
document.getElementById('offline-retry').addEventListener('click', () => {
  if (window.location.pathname === '/offline.html') {
    window.location.replace('/')
  } else {
    window.location.reload()
  }
})
renderOfflinePage()
