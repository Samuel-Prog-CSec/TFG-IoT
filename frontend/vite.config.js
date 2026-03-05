import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from "@sentry/vite-plugin"

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
    ],
    server: {
      host: true, // Necesario para que Docker pueda mapear el puerto
      port: 5173,
      watch: {
        usePolling: true, // Recomendado al desarrollar en Windows con Docker     
      }
    },
    build: {
      sourcemap: true, // Fundamental para trazar source maps en Sentry
      rollupOptions: {
        output: {
          manualChunks: getChunkName
        }
      }
    }
  };
})
