import type { CapacitorConfig } from '@capacitor/cli'

// The Next.js app needs its server. Use a remote URL only for device testing;
// Capacitor explicitly does not support server.url as a production app strategy.
const developmentUrl = process.env.CAPACITOR_SERVER_URL
if (developmentUrl) {
  const url = new URL(developmentUrl)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('CAPACITOR_SERVER_URL must use HTTPS, except for local device testing.')
  }
}

const config: CapacitorConfig = {
  appId: 'uk.co.upcatch.app',
  appName: 'UpCatch',
  webDir: 'capacitor-web',
  ios: { handleApplicationNotifications: false },
  server: developmentUrl ? { url: developmentUrl, appStartPath: '/start', cleartext: developmentUrl.startsWith('http://') } : undefined,
}

export default config
