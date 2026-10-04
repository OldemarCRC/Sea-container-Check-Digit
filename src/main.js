/**
 * ContainerCheck — ISO 6346 check digit validator.
 *
 * SECURITY DESIGN (OWASP client-side guidelines)
 * ─────────────────────────────────────────────
 * [XSS-1] No HTML string sinks anywhere: no innerHTML / outerHTML /
 *         insertAdjacentHTML / document.write / eval / new Function /
 *         string timers. All UI is built with createElement + text nodes
 *         through the `h()` helper below. This is also ENFORCED by the
 *         browser via CSP `require-trusted-types-for 'script'`.
 * [XSS-2] User input is normalised and allow-listed before processing and is
 *         only ever rendered as text (Text nodes / textContent).
 * [DoS]   Hard limits on input size and number of bulk entries.
 * [CSV]   Spreadsheet formula injection is neutralised on export.
 * [MEM]   Stateless: no localStorage / sessionStorage / cookies / IndexedDB.
 *         Data lives only in module-scoped variables and is dropped on reload.
 * [SCOPE] ES module scope — nothing is exposed on `window`.
 */
import './styles.css';

/* =========================================================================
 * 0. SECURITY LIMITS
 * ======================================================================= */
const LIMITS = Object.freeze({
  SINGLE_MAX: 11,          // a full container number
  BULK_MAX_CHARS: 50_000,  // mirrors the textarea maxlength (defence in depth)
  BULK_MAX_ENTRIES: 2_000, // caps CPU/DOM work per run
  DISPLAY_MAX: 32,         // raw input echoed back is truncated
});

/* =========================================================================
 * 1. INPUT SANITISATION  [XSS-2]
 * ======================================================================= */

/**
 * Canonicalise untrusted text before ANY processing:
 *  - NFKC folds look-alikes (e.g. full-width "ＣＳＱＵ" → "CSQU").
 *  - Control / non-printable characters are removed.
 */
const canonical = (raw) =>
  String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '');

/** Strict allow-list for the single input: only A–Z and 0–9 survive. */
const toCodeChars = (raw) => canonical(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** For analysis: uppercase and drop common separators; anything else is kept so it can be reported. */
const normalize = (raw) => canonical(raw).toUpperCase().replace(/[\s\-_.\/]/g, '');

/** Safe, bounded echo of raw input (printable ASCII only, truncated). Rendered as text anyway. */
const displayRaw = (raw) => {
  const s = canonical(raw).replace(/[^\x20-\x7E]/g, '?');
  return s.length > LIMITS.DISPLAY_MAX ? `${s.slice(0, LIMITS.DISPLAY_MAX)}…` : s;
};

/* =========================================================================
 * 2. ISO 6346 CORE — pure functions, no DOM access
 * ======================================================================= */

/** A=10 … Z=38, skipping multiples of 11 (11, 22, 33). */
const LETTER_VALUES = (() => {
  const map = Object.create(null); // no prototype → no prototype-pollution lookups
  let value = 10;
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (value % 11 === 0) value++;
    map[letter] = value++;
  }
  return Object.freeze(map);
})();

const CATEGORIES = Object.freeze(Object.assign(Object.create(null), {
  U: 'Freight container',
  J: 'Detachable freight equipment',
  Z: 'Trailer or chassis',
}));

const charValue = (ch) => (/^\d$/.test(ch) ? Number(ch) : LETTER_VALUES[ch]);

/** Weighted sum (2^0 … 2^9) of the first 10 chars, mod 11; remainder 10 → 0. */
function computeCheckDigit(first10) {
  const steps = [...first10].map((char, i) => {
    const value = charValue(char);
    const weight = 2 ** i;
    return Object.freeze({ position: i + 1, char, value, weight, product: value * weight });
  });
  const sum = steps.reduce((acc, s) => acc + s.product, 0);
  const remainder = sum % 11;
  return Object.freeze({ digit: remainder % 10, steps, sum, remainder });
}

/** status: empty | incomplete | error | computed | valid | invalid */
function analyze(raw) {
  const code = normalize(raw);
  const owner = code.slice(0, 3);
  const category = code.slice(3, 4);
  const serial = code.slice(4, 10);
  const check = code.slice(10, 11);
  const errors = {};

  if (!/^[A-Z]*$/.test(owner)) errors.owner = 'Owner code must be 3 letters (A–Z).';
  if (category && !/^[A-Z]$/.test(category)) errors.category = 'Category must be a letter: U, J or Z.';
  else if (category && !CATEGORIES[category]) errors.category = `"${category}" is not a valid category. Use U, J or Z.`;
  if (!/^\d*$/.test(serial)) errors.serial = 'Serial number must contain 6 digits.';
  if (check && !/^\d$/.test(check)) errors.check = 'Check digit must be a number (0–9).';
  if (/[^A-Z0-9]/.test(code)) errors.general = 'Contains characters that are not letters or digits.';
  if (code.length > LIMITS.SINGLE_MAX) errors.general = `Too long: ${code.length} characters (maximum is 11).`;

  let status;
  let calc = null;
  if (!code) status = 'empty';
  else if (Object.keys(errors).length) status = 'error';
  else if (code.length < 10) status = 'incomplete';
  else {
    calc = computeCheckDigit(code.slice(0, 10));
    status = code.length === 10 ? 'computed' : Number(check) === calc.digit ? 'valid' : 'invalid';
  }

  return {
    code, owner, category, serial, check, errors, status, calc,
    expected: calc ? calc.digit : null,
    corrected: calc ? code.slice(0, 10) + calc.digit : null,
  };
}

/* =========================================================================
 * 3. SAFE DOM BUILDER  [XSS-1]
 * ======================================================================= */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Attributes we allow the builder to set. Event handlers (on*), href/src, style → rejected. */
const SAFE_ATTR = /^(class|id|type|role|title|colspan|disabled|hidden|tabindex|for|aria-[a-z-]+|data-[a-z-]+)$/;

function setAttrs(el, attrs) {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (!SAFE_ATTR.test(name)) throw new TypeError(`Blocked attribute: ${name}`);
    el.setAttribute(name, value === true ? '' : String(value));
  }
}

/** Children may be nodes or strings; strings become Text nodes and are NEVER parsed as HTML. */
function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** h('p', { class: 'x' }, 'text', h('b', {}, 'bold')) */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

/** Static icon set (path data is a constant, never user-controlled). */
const ICON_PATHS = Object.freeze({
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4M12 8h.01' }]],
  warn: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01' }]],
  copy: [['rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }], ['path', { d: 'M5 15V5a2 2 0 0 1 2-2h10' }]],
});

function icon(name, cls = 'h-5 w-5 shrink-0', strokeWidth = 2.25) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': strokeWidth, 'aria-hidden': 'true', class: cls })) {
    svg.setAttribute(k, String(v));
  }
  for (const [tag, attrs] of ICON_PATHS[name]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.appendChild(node);
  }
  return svg;
}

const mono = (text, cls = 'font-mono font-bold') => h('span', { class: cls }, text);

/* =========================================================================
 * 4. SHARED UTILITIES
 * ======================================================================= */
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

const pretty = (code) => (code ? `${code.slice(0, 4)} ${code.slice(4, 10)} ${code.slice(10)}`.trim() : '');

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;          // [XSS-1] text only
  el.hidden = false;
  requestAnimationFrame(() => el.classList.remove('opacity-0', 'translate-y-4'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('opacity-0', 'translate-y-4'), 2000); // function, never a string
}

/** Clipboard: async API first; the fallback uses a detached textarea's .value (no HTML). */
async function copyText(text, message = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'fixed opacity-0 pointer-events-none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
  toast(message);
}

/* =========================================================================
 * 5. THEME — in memory only  [MEM]
 * ======================================================================= */
$('themeToggle').addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  $('themeToggle').setAttribute('aria-pressed', String(dark));
});

/* =========================================================================
 * 6. TABS (accessible: click + arrow keys)
 * ======================================================================= */
const tabs = [...document.querySelectorAll('[role="tab"]')];
const TAB_ON = ['border-sky-600', 'text-sky-700', 'dark:border-cyan-400', 'dark:text-cyan-300'];
const TAB_OFF = ['border-transparent', 'text-slate-500', 'hover:text-slate-800', 'dark:text-slate-400', 'dark:hover:text-slate-200'];
const TAB_NAMES = new Set(['single', 'bulk']);

function selectTab(name, focus = false) {
  if (!TAB_NAMES.has(name)) name = 'single'; // allow-list, hash is untrusted
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.remove(...TAB_ON, ...TAB_OFF);
    tab.classList.add(...(active ? TAB_ON : TAB_OFF));
    $(tab.getAttribute('aria-controls')).classList.toggle('hidden', !active);
    if (active && focus) tab.focus();
  }
  history.replaceState(null, '', name === 'bulk' ? '#bulk' : location.pathname + location.search);
  (name === 'bulk' ? $('bulkInput') : $('singleInput')).focus({ preventScroll: true });
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next.dataset.tab, true);
  });
});

/* =========================================================================
 * 7. SINGLE MODE — live validation
 * ======================================================================= */
const singleInput = $('singleInput');
let singleResult = analyze('');

const BANNER = Object.freeze({
  neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  info: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
  danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
});
const INPUT_STATE = Object.freeze({
  valid: ['border-emerald-500!', 'focus:ring-emerald-500/20!'],
  invalid: ['border-red-500!', 'focus:ring-red-500/20!'],
  error: ['border-amber-500!', 'focus:ring-amber-500/20!'],
});

const banner = (tone, iconName, title, ...body) =>
  h('div', { class: `flex items-start gap-3 rounded-xl border px-4 py-3 ${BANNER[tone]}` },
    icon(iconName),
    h('div', { class: 'min-w-0 flex-1' },
      h('p', { class: 'font-semibold' }, title),
      body.length ? h('div', { class: 'mt-0.5 text-sm opacity-90' }, ...body) : null));

function renderStatus(r) {
  const len = r.code.length;
  switch (r.status) {
    case 'empty':
      return banner('neutral', 'info', 'Waiting for input', 'Type a container number such as ', mono('CSQU3054383', 'font-mono font-semibold'), '.');
    case 'incomplete': {
      const bar = h('div', { class: 'h-full rounded-full bg-cyan-500 transition-all' });
      bar.style.width = `${len * 10}%`; // CSSOM property (allowed by CSP), not a style attribute string
      return banner('neutral', 'info', `${len} of 10 characters`,
        h('div', { class: 'mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700' }, bar));
    }
    case 'error':
      return banner('warning', 'warn', 'Format error',
        Object.values(r.errors).flatMap((msg, i) => (i ? [h('br'), msg] : [msg])));
    case 'computed':
      return banner('info', 'info', `Check digit is ${r.expected}`, 'Full container number: ', mono(pretty(r.corrected)));
    case 'valid':
      return banner('success', 'check', 'Valid container number', 'Check digit ', mono(r.check), ' matches the ISO 6346 calculation.');
    case 'invalid':
      return banner('danger', 'x', 'Invalid check digit',
        'Entered ', mono(r.check), ', expected ', mono(String(r.expected)), '. Correct number: ', mono(pretty(r.corrected)), ' ',
        h('button', { type: 'button', 'data-action': 'apply-fix', class: 'ml-1 font-semibold underline underline-offset-2' }, 'Use corrected'));
    default:
      return document.createTextNode('');
  }
}

/** Painted-marking plate: owner+category, serial, boxed check digit. */
function renderPlate(r) {
  const slot = (ch, cls = '') => (ch ? h('span', { class: cls }, ch) : h('span', { class: 'text-white/15' }, '·'));
  const chars = [...r.code.slice(0, 10)];
  const group = (from, to) => h('span', { class: 'tracking-[0.12em]' },
    Array.from({ length: to - from }, (_, i) => slot(chars[from + i])));

  let digit = r.check;
  let box = 'border-white/60';
  let digitCls = '';
  if (r.status === 'computed') { digit = String(r.expected); box = 'border-dashed border-cyan-400'; digitCls = 'text-cyan-300 pop'; }
  if (r.status === 'valid') { box = 'border-emerald-400'; digitCls = 'text-emerald-300 pop'; }
  if (r.status === 'invalid') { box = 'border-red-400'; digitCls = 'text-red-300 line-through decoration-2'; }

  return [
    group(0, 4),
    group(4, 10),
    h('span', { class: `inline-grid min-w-[1.4em] place-items-center rounded-md border-[3px] px-1.5 ${box}` }, slot(digit, digitCls)),
    r.status === 'invalid' ? h('span', { class: 'text-xl font-bold text-emerald-300 sm:text-2xl' }, `→ ${r.expected}`) : null,
  ].filter(Boolean);
}

const CARD_TONE = Object.freeze({
  idle: 'border-slate-200 dark:border-slate-700/80',
  ok: 'border-cyan-300 bg-cyan-50/50 dark:border-cyan-500/40 dark:bg-cyan-500/5',
  valid: 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/5',
  invalid: 'border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/5',
  error: 'border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5',
});

function card({ label, hint, value, size, state, note }) {
  const placeholder = '_'.repeat(Math.max(0, size - value.length));
  return h('div', { class: `rounded-xl border p-4 transition ${CARD_TONE[state]}` },
    h('div', { class: 'flex items-center justify-between gap-2' },
      h('p', { class: 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400' }, label),
      h('span', { class: 'hidden font-mono text-[10px] text-slate-400 xl:inline' }, hint)),
    h('p', { class: 'mt-2 font-mono text-2xl font-extrabold tracking-[0.15em] text-slate-900 dark:text-white' },
      value, h('span', { class: 'text-slate-300 dark:text-slate-600' }, placeholder)),
    h('p', { class: 'mt-1 min-h-[1rem] text-xs text-slate-500 dark:text-slate-400' }, note || ' '));
}

function renderBreakdown(r) {
  const segState = (val, size, err) => (err ? 'error' : val.length === size ? 'ok' : 'idle');
  let checkState = 'idle';
  let checkValue = r.check;
  let checkNote = 'Calculated';
  if (r.status === 'computed') { checkState = 'ok'; checkValue = String(r.expected); }
  if (r.status === 'valid') { checkState = 'valid'; checkNote = 'Matches'; }
  if (r.status === 'invalid') { checkState = 'invalid'; checkNote = `Should be ${r.expected}`; }
  if (r.errors.check) { checkState = 'error'; checkNote = 'Must be a digit'; }

  return [
    card({ label: 'Owner code (BIC)', hint: '3 letters', value: r.owner, size: 3, state: segState(r.owner, 3, r.errors.owner), note: r.errors.owner ? 'Letters only' : 'Registered with BIC' }),
    card({ label: 'Category', hint: 'U · J · Z', value: r.category, size: 1, state: segState(r.category, 1, r.errors.category), note: r.errors.category ? 'Use U, J or Z' : (CATEGORIES[r.category] || 'Equipment type') }),
    card({ label: 'Serial number', hint: '6 digits', value: r.serial, size: 6, state: segState(r.serial, 6, r.errors.serial), note: r.errors.serial ? 'Digits only' : 'Owner-assigned' }),
    card({ label: 'Check digit', hint: '1 digit', value: checkValue, size: 1, state: checkState, note: checkNote }),
  ];
}

function renderSteps(calc) {
  const fmt = (n) => n.toLocaleString('en-US');
  const th = (text, cls = 'pb-2 pr-4 font-semibold') => h('th', { class: cls }, text);
  const rows = calc.steps.map((s) =>
    h('tr', { class: 'border-b border-slate-100 last:border-0 dark:border-slate-800' },
      h('td', { class: 'py-1.5 pr-4 text-slate-400' }, String(s.position)),
      h('td', { class: 'py-1.5 pr-4 font-bold text-slate-900 dark:text-white' }, s.char),
      h('td', { class: 'py-1.5 pr-4' }, String(s.value)),
      h('td', { class: 'whitespace-nowrap py-1.5 pr-4 text-slate-500' },
        '× 2', h('sup', {}, String(s.position - 1)), h('span', { class: 'hidden sm:inline' }, ` = ${s.weight}`)),
      h('td', { class: 'py-1.5 text-right font-semibold' }, fmt(s.product))));

  return [
    h('table', { class: 'tabular mt-3 w-full font-mono text-xs sm:text-sm' },
      h('thead', { class: 'text-left text-[11px] uppercase tracking-wider text-slate-400' },
        h('tr', {}, th('Pos'), th('Char'), th('Value'), th('Weight'), th('Product', 'pb-2 text-right font-semibold'))),
      h('tbody', {}, rows)),
    h('div', { class: 'tabular mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm dark:bg-slate-800/60 sm:grid-cols-3' },
      h('div', {}, 'Sum = ', h('b', {}, fmt(calc.sum))),
      h('div', {}, `${fmt(calc.sum)} mod 11 = `, h('b', {}, String(calc.remainder))),
      h('div', {}, 'Check digit = ', h('b', { class: 'text-sky-600 dark:text-cyan-400' }, String(calc.digit)),
        calc.remainder === 10 ? h('span', { class: 'text-xs text-slate-500' }, ' (10 → 0)') : null)),
  ];
}

function renderSingle() {
  const r = (singleResult = analyze(singleInput.value));
  // replaceChildren(...) swaps DOM nodes — no HTML parsing involved.
  $('singleStatus').replaceChildren(renderStatus(r));
  $('plate').replaceChildren(...renderPlate(r));
  $('breakdown').replaceChildren(...renderBreakdown(r));
  $('charCount').textContent = `${r.code.length}/11`;

  singleInput.classList.remove(...Object.values(INPUT_STATE).flat());
  if (INPUT_STATE[r.status]) singleInput.classList.add(...INPUT_STATE[r.status]);

  $('stepsBox').classList.toggle('hidden', !r.calc);
  $('steps').replaceChildren(...(r.calc ? renderSteps(r.calc) : []));
  $('copySingle').disabled = !r.corrected;
}

// [XSS-2] Live allow-list filter: only A–Z/0–9, max 11 chars, caret preserved.
singleInput.addEventListener('input', () => {
  const { value, selectionStart } = singleInput;
  const clean = toCodeChars(value).slice(0, LIMITS.SINGLE_MAX);
  if (clean !== value) {
    const caret = Math.min(toCodeChars(value.slice(0, selectionStart ?? value.length)).length, clean.length);
    singleInput.value = clean;
    singleInput.setSelectionRange(caret, caret);
  }
  renderSingle();
});

const setSingle = (value) => {
  singleInput.value = toCodeChars(value).slice(0, LIMITS.SINGLE_MAX);
  renderSingle();
  singleInput.focus();
};

$('exampleBtn').addEventListener('click', () => setSingle('CSQU3054383'));
$('clearSingle').addEventListener('click', () => setSingle(''));
$('copySingle').addEventListener('click', () => {
  if (singleResult.corrected) copyText(singleResult.corrected, `Copied ${singleResult.corrected}`);
});
$('singleStatus').addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('[data-action="apply-fix"]')) setSingle(singleResult.corrected);
});
singleInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSingle(''); });

/* =========================================================================
 * 8. BULK MODE
 * ======================================================================= */
const bulkInput = $('bulkInput');
let bulkRows = [];
let bulkFilter = 'all';

const BULK_STATUS = Object.freeze({
  valid: { label: 'Valid', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  invalid: { label: 'Invalid', badge: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  computed: { label: 'Missing digit', badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300' },
  malformed: { label: 'Malformed', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
});
const FILTERS = Object.freeze([['all', 'All'], ['valid', 'Valid'], ['invalid', 'Invalid'], ['computed', 'Missing'], ['malformed', 'Malformed']]);
const FILTER_KEYS = new Set(FILTERS.map(([k]) => k));

/** [DoS] Bounded split by new line / comma / semicolon / tab. */
function splitEntries(text) {
  const bounded = String(text).slice(0, LIMITS.BULK_MAX_CHARS);
  const all = bounded.split(/[\r\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  return { entries: all.slice(0, LIMITS.BULK_MAX_ENTRIES), dropped: Math.max(0, all.length - LIMITS.BULK_MAX_ENTRIES), clipped: text.length > LIMITS.BULK_MAX_CHARS };
}

function setNotice(message) {
  const el = $('bulkNotice');
  el.textContent = message || '';
  el.classList.toggle('hidden', !message);
}

function runBulk() {
  const { entries, dropped, clipped } = splitEntries(bulkInput.value);
  const seen = new Map();
  bulkRows = entries.map((raw, i) => {
    const r = analyze(raw);
    const status = r.status === 'error' || r.status === 'incomplete' ? 'malformed' : r.status;
    const reason = r.status === 'incomplete' ? `Too short (${r.code.length} chars)` : Object.values(r.errors)[0] || '';
    const key = r.corrected || r.code;
    seen.set(key, (seen.get(key) || 0) + 1);
    return { index: i + 1, display: displayRaw(raw), ...r, status, reason, key };
  });
  bulkRows.forEach((row) => { row.duplicate = seen.get(row.key) > 1; });

  setNotice(dropped || clipped
    ? `Input limited for safety: max ${LIMITS.BULK_MAX_ENTRIES.toLocaleString('en-US')} entries / ${LIMITS.BULK_MAX_CHARS.toLocaleString('en-US')} characters per run.${dropped ? ` ${dropped} entries were skipped.` : ''}`
    : '');

  $('bulkResults').classList.toggle('hidden', bulkRows.length === 0);
  if (!bulkRows.length) { toast('Nothing to validate'); return; }
  bulkFilter = 'all';
  renderBulk();
}

function statCard(label, n, color) {
  return h('div', { class: 'rounded-xl border border-slate-200 p-3 dark:border-slate-700/80' },
    h('p', { class: 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400' }, label),
    h('p', { class: `tabular mt-1 text-2xl font-extrabold ${color}` }, String(n)));
}

function bulkRow(r) {
  const st = BULK_STATUS[r.status];
  const dash = () => h('span', { class: 'text-slate-400' }, '—');

  let digitCell = dash();
  if (r.status === 'valid') digitCell = h('span', { class: 'font-bold text-emerald-600 dark:text-emerald-400' }, r.check);
  if (r.status === 'invalid') digitCell = [h('span', { class: 'text-red-500 line-through' }, r.check), ' → ', h('span', { class: 'font-bold text-emerald-600 dark:text-emerald-400' }, String(r.expected))];
  if (r.status === 'computed') digitCell = ['+ ', h('span', { class: 'font-bold text-cyan-600 dark:text-cyan-400' }, String(r.expected))];

  return h('tr', { class: 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40' },
    h('td', { class: 'tabular px-4 py-3 text-slate-400' }, String(r.index)),
    // Raw input is echoed ONLY as a Text node (bounded + printable) → payloads like <img onerror> render inert.
    h('td', { class: 'break-all px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white' },
      r.display,
      r.duplicate ? h('span', { class: 'ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300', title: 'Appears more than once' }, 'dup') : null),
    h('td', { class: 'px-4 py-3' },
      h('span', { class: `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.badge}` }, st.label),
      r.reason ? h('p', { class: 'mt-1 max-w-[16rem] text-xs text-slate-500 dark:text-slate-400' }, r.reason) : null),
    h('td', { class: 'px-4 py-3 font-mono' }, digitCell),
    h('td', { class: 'px-4 py-3 font-mono font-semibold' }, r.corrected ? pretty(r.corrected) : dash()),
    h('td', { class: 'px-4 py-3 text-right' },
      // data-copy only ever holds a validated [A-Z]{4}[0-9]{7} value.
      r.corrected ? h('button', {
        type: 'button', 'data-copy': r.corrected, title: 'Copy', 'aria-label': `Copy ${r.corrected}`,
        class: 'rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 dark:hover:text-cyan-400',
      }, icon('copy', 'h-4 w-4', 2)) : null));
}

function renderBulk() {
  const count = (s) => bulkRows.filter((r) => r.status === s).length;
  $('bulkStats').replaceChildren(
    statCard('Total', bulkRows.length, 'text-slate-900 dark:text-white'),
    statCard('Valid', count('valid'), 'text-emerald-600 dark:text-emerald-400'),
    statCard('Invalid', count('invalid'), 'text-red-600 dark:text-red-400'),
    statCard('Missing digit', count('computed'), 'text-cyan-600 dark:text-cyan-400'),
    statCard('Malformed', count('malformed'), 'text-amber-600 dark:text-amber-400'));

  $('bulkFilters').replaceChildren(...FILTERS.map(([key, label]) => h('button', {
    type: 'button', 'data-filter': key, 'aria-pressed': String(bulkFilter === key),
    class: `rounded-md px-3 py-1.5 text-xs font-semibold transition ${bulkFilter === key
      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`,
  }, label)));

  const visible = bulkRows.filter((r) => bulkFilter === 'all' || r.status === bulkFilter);
  $('bulkBody').replaceChildren(...(visible.length
    ? visible.map(bulkRow)
    : [h('tr', {}, h('td', { colspan: 6, class: 'px-4 py-8 text-center text-sm text-slate-400' }, 'No entries in this category.'))]));
}

/**
 * [CSV] Export with RFC 4180 quoting AND formula-injection protection
 * (OWASP "CSV Injection"): cells starting with = + - @ TAB CR are prefixed
 * with an apostrophe so Excel/Sheets treat them as text, not formulas.
 */
function csvCell(value) {
  let s = canonical(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv() {
  const header = ['input', 'normalized', 'status', 'entered_check_digit', 'expected_check_digit', 'correct_number', 'note'];
  const lines = bulkRows.map((r) => [
    r.display, r.code.slice(0, 64), BULK_STATUS[r.status].label, r.check, r.expected, r.corrected,
    r.reason || (r.duplicate ? 'Duplicate' : ''),
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}

bulkInput.addEventListener('input', () => {
  const { entries, dropped } = splitEntries(bulkInput.value);
  $('bulkCount').textContent = `${entries.length + dropped} detected`;
});
bulkInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runBulk(); }
});
$('runBulk').addEventListener('click', runBulk);
$('sampleBulk').addEventListener('click', () => {
  bulkInput.value = ['CSQU3054383', 'MSCU1234566', 'TGHU7612344', 'MAEU845123', 'HLXU 300212-2', 'OOLU1503420', 'ABCX1234567', 'CMAU41897', 'CSQU3054383'].join('\n');
  bulkInput.dispatchEvent(new Event('input'));
  runBulk();
});
$('clearBulk').addEventListener('click', () => {
  bulkInput.value = '';
  bulkRows = [];               // [MEM] drop processed data from memory
  setNotice('');
  bulkInput.dispatchEvent(new Event('input'));
  $('bulkResults').classList.add('hidden');
  bulkInput.focus();
});
$('bulkFilters').addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-filter]') : null;
  if (btn && FILTER_KEYS.has(btn.dataset.filter)) { bulkFilter = btn.dataset.filter; renderBulk(); }
});
$('bulkBody').addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-copy]') : null;
  const value = btn?.dataset.copy ?? '';
  if (/^[A-Z]{4}\d{7}$/.test(value)) copyText(value, `Copied ${value}`); // re-validate before use
});
$('copyCsv').addEventListener('click', () => copyText(toCsv(), `CSV copied (${bulkRows.length} rows)`));
$('downloadCsv').addEventListener('click', () => {
  // Blob URL is created and revoked immediately; the file name is a constant.
  const url = URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'container-check-results.csv';
  a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
$('copyCorrected').addEventListener('click', () => {
  const list = bulkRows.filter((r) => r.corrected).map((r) => r.corrected);
  if (!list.length) { toast('No correctable numbers'); return; }
  copyText(list.join('\n'), `Copied ${list.length} corrected number${list.length > 1 ? 's' : ''}`);
});

/* =========================================================================
 * 9. SERVICE WORKER (production only) — Trusted Types policy
 * =========================================================================
 * Under `require-trusted-types-for 'script'`, serviceWorker.register() only
 * accepts a TrustedScriptURL. The single policy allowed by the CSP
 * ("app-sw") accepts exactly one URL — our own sw.js — and rejects anything else.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL;
  const swUrl = new URL(`${base}sw.js`, location.origin).href;
  const policy = window.trustedTypes?.createPolicy('app-sw', {
    createScriptURL: (url) => {
      if (url === swUrl) return url;
      throw new TypeError('Blocked untrusted script URL');
    },
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(policy ? policy.createScriptURL(swUrl) : swUrl, { scope: base })
      .catch(() => { /* offline support is optional */ });
  });
}

/* =========================================================================
 * 10. INIT — `?c=` deep link is untrusted: allow-listed to [A-Z0-9]{0,11}
 * ======================================================================= */
$('year').textContent = String(new Date().getFullYear());
const initial = new URLSearchParams(location.search).get('c');
if (initial) singleInput.value = toCodeChars(initial).slice(0, LIMITS.SINGLE_MAX);
renderSingle();
selectTab(location.hash === '#bulk' ? 'bulk' : 'single');
