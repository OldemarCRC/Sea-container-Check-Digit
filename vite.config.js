import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/Sea-container-Check-Digit/'

/**
 * SECURITY · Subresource Integrity (SRI).
 * After bundling, adds integrity="sha384-…" and crossorigin="anonymous" to
 * every <script src> and <link rel="stylesheet|modulepreload"> in index.html.
 * If a file is altered on the server/CDN, the browser refuses to execute it.
 * Covers Vite chunks/assets and files copied from /public (security-init.js).
 */
function subresourceIntegrity() {
  let publicDir = 'public'
  const sri = (data) => `sha384-${createHash('sha384').update(data).digest('base64')}`

  return {
    name: 'subresource-integrity',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir },
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        const lookup = (url) => {
          if (/^(https?:)?\/\//.test(url)) throw new Error(`SRI: external resource not allowed: ${url}`)
          const file = url.startsWith(BASE) ? url.slice(BASE.length) : url.replace(/^\//, '')
          const item = bundle?.[file]
          if (item) return item.type === 'chunk' ? item.code : item.source
          const fromPublic = resolve(publicDir, file)
          if (existsSync(fromPublic)) return readFileSync(fromPublic)
          throw new Error(`SRI: cannot hash ${url}`)
        }
        const tagRe = /<(script|link)\b([^>]*?)\s(src|href)="([^"]+)"([^>]*)>/g
        return html.replace(tagRe, (tag, name, before, attr, url, after) => {
          const all = before + after
          if (name === 'link' && !/rel="(stylesheet|modulepreload)"/.test(all)) return tag
          if (/\bintegrity=/.test(all)) return tag
          const cors = /\bcrossorigin\b/.test(all) ? '' : ' crossorigin="anonymous"'
          return `<${name}${before} ${attr}="${url}"${after} integrity="${sri(lookup(url))}"${cors}>`
            .replace(/\scrossorigin(?=[\s>])/, ' crossorigin="anonymous"')
        })
      },
    },
  }
}

/**
 * The Vite dev server injects inline <style> tags for HMR, which the strict
 * CSP would (correctly) block. The CSP meta tag is therefore removed ONLY when
 * running `npm run dev`; production builds always keep it.
 */
function devRelaxCsp() {
  return {
    name: 'dev-relax-csp',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '<!-- CSP disabled in dev server only -->'),
  }
}

export default defineConfig({
  base: BASE,
  plugins: [
    tailwindcss(),
    devRelaxCsp(),
    VitePWA({
      registerType: 'autoUpdate',
      // SECURITY: no auto-injected inline/registration script; main.js registers
      // the worker itself through a Trusted Types policy.
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sea Container Check Digit Verifier',
        short_name: 'ContainerCheck',
        description: 'ISO 6346 container check digit calculator and validator',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,ico,svg}'] },
    }),
    subresourceIntegrity(),
  ],
  build: {
    // SECURITY: never inline assets as data: URIs (CSP allows only 'self').
    assetsInlineLimit: 0,
    // No inline modulepreload polyfill.
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
})
