import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.kavanu',
  appName: 'Az Kavanu',
  webDir: 'dist',
  plugins: {
    LocalNotifications: { iconColor: '#27408b' },
  },
};

export default config;
