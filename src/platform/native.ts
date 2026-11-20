// Android app shell (Capacitor): file saving, the hardware back button and
// lifecycle hooks. Everything here is a no-op in a normal browser tab.

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

const FOLDER = 'ResonixStudio';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Save into Documents/ResonixStudio; if shared storage is unavailable, write
 * to the app cache and open the share sheet instead. Returns where it went.
 */
export async function saveFileNative(blob: Blob, filename: string): Promise<string> {
  const data = await blobToBase64(blob);
  const path = `${FOLDER}/${filename}`;
  try {
    await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
    return `Документы/${path}`;
  } catch {
    const { uri } = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    await Share.share({ title: filename, files: [uri] });
    return 'меню «Поделиться»';
  }
}

export interface NativeHooks {
  /** Close the topmost overlay; return true if something was closed. */
  back: () => boolean;
  /** Called when the app goes to the background. */
  pause: () => void;
}

export function initNativeShell(hooks: NativeHooks): void {
  if (!isNativeApp()) return;
  // An app should not pinch-zoom its whole UI.
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no');
  document.documentElement.classList.add('native-app');
  void App.addListener('backButton', () => {
    if (!hooks.back()) void App.minimizeApp();
  });
  void App.addListener('pause', hooks.pause);
}
