# Security

ContainerCheck runs entirely in the browser. It has no backend, no accounts and no analytics, and it makes no network calls after the page loads. This file lists the client-side controls in the app, mapped to OWASP guidance, so auditors and pentesters can check each one.

## Controls

| # | Risk (OWASP) | Control | Where |
|---|---|---|---|
| 1 | DOM / reflected XSS | No HTML string sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string timers). The UI is built only with `createElement` and Text nodes through `h()`, which only accepts allow-listed attributes (it rejects `on*`, `href`, `src` and `style`). | `src/main.js` §3 |
| 2 | XSS (browser-enforced) | CSP `require-trusted-types-for 'script'`. Any string passed to an HTML or script sink throws a `TypeError`, even if such a call were added later. Only one Trusted Types policy (`app-sw`) is allowed, and it accepts only the app's own `sw.js` URL. | `index.html`, `src/main.js` §9 |
| 3 | Input handling | Input is normalized with NFKC and stripped of control and zero-width characters, then filtered against an allow-list (`[A-Z0-9]`). Raw text that is shown back to the user is truncated, limited to printable ASCII, and rendered as text only. The `?c=` and `#bulk` URL inputs go through the same allow-list. | `src/main.js` §1, §10 |
| 4 | Script and resource injection | Strict CSP with `default-src 'none'` and `script-src` / `style-src` / `font-src` / `img-src` set to `'self'`. There is no `unsafe-inline` or `unsafe-eval`, and `base-uri`, `form-action` and `object-src` are set to `'none'`. | `index.html` |
| 5 | Third-party / supply chain | The page loads zero third-party resources. Tailwind is compiled at build time and fonts are self-hosted with `@fontsource`. Every `<script>` and stylesheet gets `integrity="sha384-…"` and `crossorigin="anonymous"` at build time, and the build fails if an external URL appears in `index.html`. | `vite.config.js` (`subresourceIntegrity`) |
| 6 | Clickjacking | OWASP frame-busting. The UI is hidden by default with CSS and revealed only when `window.self === window.top`. A framed copy tries to break out, and stays blank if that fails. | `public/security-init.js`, `src/styles.css` |
| 7 | Sensitive data exposure | Stateless processing. Nothing is stored in `localStorage`, `sessionStorage`, cookies or IndexedDB, and the theme is kept in memory. A `no-referrer` policy keeps the page URL from leaking. External links use `rel="noopener noreferrer"`. | all |
| 8 | CSV / formula injection | On export, cells that start with `=`, `+`, `-`, `@`, TAB or CR get a `'` prefix, and every cell is quoted per RFC 4180. | `src/main.js` (`csvCell`) |
| 9 | Client-side DoS | Bulk input is capped at 50,000 characters and 2,000 entries per run. Single input is capped at 11 characters. | `src/main.js` §0 |
| 10 | Code hygiene | ES module scope with no globals, frozen lookup tables, prototype-less maps, no source maps in production, and no runtime dependencies. | `src/main.js`, `vite.config.js` |
| 11 | Vulnerable dependencies (A06) | No runtime dependencies (`npm audit --omit=dev` → 0). Deployment runs through GitHub Actions, not the `gh-pages` package, whose dependency chain contains `braces` (GHSA-vfj7-8cjw-p6xm, no patched release). CI installs with `npm ci --ignore-scripts`, fails on any high or critical advisory (`npm audit --audit-level=high`), and runs with a least-privilege token. | `.github/workflows/deploy.yml` |

## Limits of static hosting (GitHub Pages)

GitHub Pages cannot send custom HTTP headers, and browsers ignore these directives when they come from a `<meta>` tag:

- `frame-ancestors`
- `X-Frame-Options`
- CSP reporting (`report-uri` / `report-to`)

Control #6 covers clickjacking in the meantime. If the site moves to a host that supports headers (Cloudflare Pages, Netlify, Nginx and similar), send the following. Cloudflare Pages and Netlify read them from a `_headers` file.

```
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'; trusted-types app-sw
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## Development note

The Vite dev server (`npm run dev`) injects inline styles for hot reload, so the dev server removes the CSP `<meta>` tag. `npm run build` and `npm run preview` always serve the strict policy. Run security tests against the production build.

## Reporting a vulnerability

Please open a private security advisory on GitHub, or contact the author through the LinkedIn link in the footer.
