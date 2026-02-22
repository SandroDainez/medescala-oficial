import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.medescala.app',
  appName: 'MedEscala',
  webDir: 'dist',
  server: {
    url: process.env.VITE_APP_URL || 'https://medescala.vercel.app',
    cleartext: true
  }
};

export default config;
