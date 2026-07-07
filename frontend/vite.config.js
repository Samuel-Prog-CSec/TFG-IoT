import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from "@sentry/vite-plugin"
import { visualizer } from 'rollup-plugin-visualizer'
import { compression } from 'vite-plugin-compression2'

const getChunkName = (id) => {
  if (!id.includes('node_modules')) {
    return null
  }

  if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('/react/')) {
    return 'react-core'
  }

  if (id.includes('framer-motion')) {
    return 'motion'
  }

  if (id.includes('lucide-react')) {
    return 'icons'
  }

  if (id.includes('@dnd-kit')) {
    return 'dnd'
  }

  if (id.includes('recharts')) {
    return 'charts'
  }

  if (id.includes('socket.io-client')) {
    return 'socket'
  }

  if (id.includes('/axios/')) {
    return 'http'
  }

  // @sentry/* (T-907): chunk independiente, cargado lazy desde main.jsx.
  if (id.includes('@sentry/')) {
    return 'sentry'
  }

  // qrcode.react (T-907): solo se usa en MFA Setup; chunk aparte para no entrar en el bundle base.
  if (id.includes('qrcode.react') || id.includes('/qrcode/')) {
    return 'qrcode'
  }

  if (
    id.includes('/sonner/') ||
    id.includes('/clsx/') ||
    id.includes('/tailwind-merge/') ||
    id.includes('/class-variance-authority/')
  ) {
    return 'ui-utils'
  }

  return null
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';
  const shouldAnalyze = env.BUILD_ANALYZE === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      env.SENTRY_AUTH_TOKEN
        ? sentryVitePlugin({
            org: env.SENTRY_ORG || 'tfg-iot',
            project: env.SENTRY_PROJECT || 'frontend',
            authToken: env.SENTRY_AUTH_TOKEN,
          })
        : null,
      // T-907 Fase B: compresión pre-comprimida en build de producción. Genera
      // `<asset>.br` y `<asset>.gz` junto al asset original. Cloudflare Pages
      // y la mayoría de CDN sirven la variante adecuada por Accept-Encoding
      // sin coste extra en runtime y reducen ~20-30% el peso transferido.
      isProd &&
        compression({
          algorithm: 'brotliCompress',
          threshold: 1024,
          deleteOriginalAssets: false,
        }),
      isProd &&
        compression({
          algorithm: 'gzip',
          threshold: 1024,
          deleteOriginalAssets: false,
        }),
      // T-907 Fase B: treemap visual del bundle. Solo se activa cuando se pasa
      // `BUILD_ANALYZE=true npm run build`. Genera `dist/stats.html` con tamaños
      // gzip+brotli por chunk; útil para detectar dependencias inesperadas.
      shouldAnalyze &&
        visualizer({
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
          open: false,
          template: 'treemap',
        }),
    ].filter(Boolean),
    server: {
      host: true, // Necesario para que Docker pueda mapear el puerto
      port: 5173,
      watch: {
        usePolling: true, // Recomendado al desarrollar en Windows con Docker
      }
    },
    build: {
      // T-907: en producción se generan source maps pero NO se enlazan en los
      // bundles ('hidden'). Sentry los sigue subiendo mediante sentryVitePlugin
      // y los stack traces de errores reportados se simbolican server-side.
      // El navegador no los descarga, lo que ahorra ~15-25% del peso transferido
      // y evita exponer el código fuente original a clientes no autorizados.
      sourcemap: isProd ? 'hidden' : true,
      rolldownOptions: {
        output: {
          manualChunks: getChunkName
        }
      }
    }
  };
})
