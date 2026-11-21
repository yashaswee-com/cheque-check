# Install the app and handle connection problems

Cheque Check works in a modern browser and can also be installed as a web app. No app store is required.

## Install from Settings

1. Open **Settings**.
2. Find the **Install ChequeCheck** card below your profile.
3. Choose **Install** when the browser offers it.
4. Wait for browser confirmation.

The card can hide after installation. Installation does not automatically enable push notifications.

## Manual installation

- **iPhone/iPad:** open Cheque Check in Safari, choose **Share → Add to Home Screen**, then open the installed app.
- **Android:** use the browser menu and choose **Install app** or **Add to Home screen** when available.
- **macOS Safari:** supported versions may offer **File → Add to Dock**.
- **Other browsers:** look for Install in the address bar or browser menu.

Installation options depend on browser and operating-system support.

## Enable push after installation

On iOS, open the installed app before enabling push. Then open **Settings → Notifications → Push on this device** and approve the browser permission.

Installing and granting notification permission are separate actions.

## Offline behavior

Cheque Check's service worker can show a generic offline/retry page after a failed page navigation, but only after that service worker has successfully installed and activated.

It does **not**:

- cache cheque, party, account, or report data;
- save edits offline for later sync;
- make API calls, file downloads, or sign-in work offline;
- guarantee that a first visit works without a connection.

If an already-open page remains visible, reconnect before relying on its data or saving changes.

## If a page cannot load

1. Check that the device has a connection.
2. Choose **Retry** on the offline page or reload the requested page.
3. Open the app again after a browser or service-worker update.
4. If repeated loading fails, use a supported browser and check the in-app support options.

Do not start a fresh cheque, scan, or payment while assuming the original uncertain request did not complete.
