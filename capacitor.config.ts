import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.resonix.studio',
  appName: 'Resonix Studio',
  webDir: 'dist',
  backgroundColor: '#121418',
  android: {
    // Audio apps should not stall while the WebView is hidden behind a dialog.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
};

export default config;
