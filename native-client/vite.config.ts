import { defineConfig, loadEnv, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const project = resolve(here, '..')
const native = (file: string) => resolve(here, file)

function nativeNavigation(): Plugin {
  const substitutions = new Map([
    [resolve(project, 'components/upcatch/onboarding.tsx').replaceAll('\\', '/'), ["window.location.assign('/')", "window.dispatchEvent(new Event('upcatch:native-reload'))"]],
    [resolve(project, 'components/upcatch/app-provider.tsx').replaceAll('\\', '/'), [
      "void detachPush().catch(()=>undefined).then(()=>createClient().auth.signOut()).then(()=>window.location.assign('/auth/login'))",
      "void nativeSignOut().catch(()=>showToast('Sign out could not be completed. Please retry.'))",
    ]],
  ])
  return {
    name: 'upcatch-native-navigation',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer?.replaceAll('\\', '/').includes('/components/account/')) return null
      if (source === './install-app') return native('install-app.tsx')
      if (source === './location-help') return native('location-help.tsx')
      return null
    },
    transform(source, id) {
      const substitution = substitutions.get(id.replaceAll('\\', '/'))
      if (!substitution) return null
      const [webNavigation, nativeEvent] = substitution
      if (!source.includes(webNavigation)) throw new Error(`Native navigation hook missing in ${id}`)
      const replacement = source.replace(webNavigation, nativeEvent)
      return id.replaceAll('\\', '/').endsWith('/components/upcatch/app-provider.tsx')
        ? `import { nativeSignOut } from '${native('account-control.ts').replaceAll('\\', '/')}'\n${replacement}`
        : replacement
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, project, 'NEXT_PUBLIC_'), ...loadEnv(mode, project, 'MOBILE_API_BASE_URL') }
  const apiBaseUrl = env.MOBILE_API_BASE_URL || 'https://www.upcatch.uk'
  const apiUrl = new URL(apiBaseUrl)
  if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash)
    throw new Error('MOBILE_API_BASE_URL must be an HTTPS origin.')
  if (mode === 'production' && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))
    throw new Error('The native release bundle requires public Supabase URL and publishable key.')
  return {
    root: here,
    plugins: [nativeNavigation()],
    publicDir: resolve(project, 'public'),
    base: '/',
    esbuild: { jsx: 'automatic' },
    css: { postcss: project },
    resolve: { alias: [
      { find: '@/lib/supabase/client', replacement: native('supabase-client.ts') },
      { find: '@/app/onboarding/actions', replacement: native('onboarding-actions.ts') },
      { find: '@/components/account/install-app', replacement: native('install-app.tsx') },
      { find: '@/components/account/location-help', replacement: native('location-help.tsx') },
      { find: 'next/link', replacement: native('link.tsx') },
      { find: 'next/dynamic', replacement: native('dynamic.tsx') },
      { find: /^@\//, replacement: `${project.replaceAll('\\', '/')}/` },
    ] },
    define: {
      __UPCATCH_PUBLIC_CONFIG__: JSON.stringify({
        supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || '',
        publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
        apiBaseUrl: apiUrl.origin,
      }),
      'process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID': JSON.stringify(env.NEXT_PUBLIC_ONESIGNAL_APP_ID || ''),
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(apiUrl.origin),
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    build: { outDir: resolve(project, 'capacitor-web'), emptyOutDir: true, target: 'es2022' },
  }
})
