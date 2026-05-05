import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.okiconstruct.app', 
  appName: 'okiconstruct',
  webDir: 'out',
  server: {
    hostname: 'okiconstruct.firebaseapp.com', // Tells the app to use this domain internally
    androidScheme: 'https'
  }
};

export default config;