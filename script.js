/* =====================================================================
   Mabel's Table — Single-File Edition
   Everything runs client-side: React (CDN) + localStorage + BroadcastChannel
   ===================================================================== */

const { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef } = React;
const { createRoot } = ReactDOM;

/* --------------------------------------------------------------- KEYS */
const K = {
  users:          'tf_users',
  settings:       'tf_settings',
  categories:     'tf_categories',
  items:          'tf_items',
  tables:         'tf_tables',
  orders:         'tf_orders',
  requests:       'tf_requests',
  session:        'tf_session',
  customer:       'tf_customer',
  feedback:       'tf_feedback',
  feedbackGiven:  'tf_feedback_given',
};

/* ---------------------------------------------------------- storage I/O */
function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  broadcast({ type: 'store', key });
}

/* ------------------------------------------------------------ realtime */
let channel = null;
try { channel = new BroadcastChannel('tableflow'); } catch {}
const listeners = new Set();

function broadcast(msg) { listeners.forEach((fn) => fn(msg)); if (channel) channel.postMessage(msg); }
if (channel) channel.onmessage = (e) => listeners.forEach((fn) => fn(e.data));

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function useStore(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  useEffect(() => {
    return subscribe((msg) => {
      if (msg?.type === 'store' && msg.key === key) setValue(read(key, fallback));
    });
  }, [key]);
  const set = useCallback((v) => {
    const next = typeof v === 'function' ? v(read(key, fallback)) : v;
    write(key, next);
    setValue(next);
  }, [key]);
  return [value, set];
}

/* ---------------------------------------------------------------- util */
const uid = () => Date.now() + Math.floor(Math.random() * 100000);
const nowISO = () => new Date().toISOString();
const money = (n, c = '$') => c + Number(n || 0).toFixed(2);

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return new Date(iso).toLocaleDateString();
}
const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ---------------------------------------------------------------- QR */
function generateQrDataUrl(text, targetPx = 320) {
  if (typeof qrcode === 'undefined') {
    throw new Error('QR library not loaded. Check your internet connection.');
  }
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const modules = qr.getModuleCount();
  const cellSize = Math.max(3, Math.floor(targetPx / (modules + 8)));
  return qr.createDataURL(cellSize, 4);
}

/* ---------------------------------------------------------------- ETA */
const DEFAULT_PREP_MIN = 20;
const DEFAULT_REQ_MIN  = 3;
const RESOLVED_VISIBLE_MS = 90 * 1000;

function fmtTime(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function computeOrderEta(totalItems, prepMinutes) {
  const extra = Math.min(15, (Number(totalItems) || 0) * 1.5);
  const mins = (Number(prepMinutes) || DEFAULT_PREP_MIN) + extra;
  return new Date(Date.now() + mins * 60000).toISOString();
}

function getOrderEta(order, settings) {
  if (order?.eta_at) return new Date(order.eta_at);
  const base = new Date(order.created_at).getTime();
  const fallback = (Number(settings?.prepMinutes) || DEFAULT_PREP_MIN) * 60000;
  return new Date(base + fallback);
}

function getRequestEta(req, settings) {
  if (req?.eta_at) return new Date(req.eta_at);
  const base = new Date(req.created_at).getTime();
  const fallback = (Number(settings?.requestMinutes) || DEFAULT_REQ_MIN) * 60000;
  return new Date(base + fallback);
}

function etaCountdown(eta, now) {
  const remainingMs = eta.getTime() - now;
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));
  return { remainingMs, remainingMin, overdue: remainingMs <= 0 };
}

/* --------------------------------------------------------- sound FX */
let audioCtx = null;
function primeAudio() {
  if (audioCtx) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  } catch {}
}
function playDing(duration = 0.16) {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {}
}
function playChime() {
  if (!audioCtx) return;
  try {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const now = audioCtx.currentTime + i * 0.06;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  } catch {}
}

/* -------------------------------------------------------------- ICONS */
const PATHS = {
  utensils:       '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  qr:             '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  plus:           '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus:          '<line x1="5" y1="12" x2="19" y2="12"/>',
  x:              '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check:          '<polyline points="20 6 9 17 4 12"/>',
  'chevron-right':'<polyline points="9 18 15 12 9 6"/>',
  'arrow-right':  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  refresh:        '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  trash:          '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  pencil:         '<path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  download:       '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  copy:           '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'external-link':'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  search:         '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  send:           '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  eye:            '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':      '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
  'image-plus':   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/>',
  'folder-plus':  '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/>',
  save:           '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  'log-out':      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  layout:         '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  receipt:        '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  bell:           '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  gear:           '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'menu-burger':  '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  users:          '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  armchair:       '<path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 11v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z"/><path d="M5 18v2"/><path d="M19 18v2"/>',
  sparkles:       '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  smartphone:     '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  chart:          '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  mail:           '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  lock:           '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  inbox:          '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'message-plus': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  store:          '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
  percent:        '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  globe:          '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  link:           '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>',
  clock:          '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'x-circle':     '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  chef:           '<path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/>',
  droplet:        '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  bag:            '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  help:           '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  loader:         '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>',
  phone:          '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  user:           '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  star:           '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart:          '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
};

const Icon = ({ name, size = 18, className = '', stroke = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
       fill="none" stroke="currentColor" strokeWidth={stroke}
       strokeLinecap="round" strokeLinejoin="round" className={className}
       dangerouslySetInnerHTML={{ __html: PATHS[name] || PATHS.help }} />
);

/* -------------------------------------------------------------- TOAST */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, tone: opts.tone || 'info' }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration ?? 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id}
               className={`animate-toast rounded-2xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl ${
                 t.tone === 'success' ? 'border-emerald-500/40 bg-emerald-900/70 text-emerald-100' :
                 t.tone === 'warn' ? 'border-amber-500/40 bg-amber-900/70 text-amber-100' :
                 t.tone === 'error' ? 'border-rose-500/40 bg-rose-900/70 text-rose-100' :
                 'border-white/10 bg-slate-900/95 text-slate-100'
               }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* -------------------------------------------------------------- MODAL */
function Modal({ open, onClose, title, subtitle, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 flex max-h-[92vh] w-full flex-col ${widths[size]} animate-fade-in rounded-t-3xl border border-white/10 bg-slate-900/95 shadow-2xl sm:rounded-3xl`}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ BADGES */
const ORDER_META = {
  pending:   { label: 'Pending',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',   icon: 'clock' },
  preparing: { label: 'Preparing', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',         icon: 'chef' },
  served:    { label: 'Served',    cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', icon: 'utensils' },
  completed: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: 'check-circle' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',      icon: 'x-circle' },
};
const REQ_META = {
  bill:       { label: 'Bill',       cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: 'receipt' },
  waiter:     { label: 'Waiter',     cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',   icon: 'bell' },
  water:      { label: 'Water',      cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',           icon: 'droplet' },
  assistance: { label: 'Assistance', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', icon: 'help' },
  custom:     { label: 'Request',    cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',     icon: 'message-plus' },
};

const Badge = ({ meta }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${meta.cls}`}>
    <Icon name={meta.icon} size={11} stroke={2.6} />
    {meta.label}
  </span>
);

const StatusDot = ({ status }) => {
  const colors = { free: 'bg-emerald-400', seated: 'bg-indigo-400', needs_attention: 'bg-amber-400' };
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${colors[status] || colors.free}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colors[status] || colors.free}`} />
    </span>
  );
};

/* ---------------------------------------------------------------- AUTH */
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => read(K.session, null));

  useEffect(() => subscribe((msg) => {
    if (msg?.type === 'store' && msg.key === K.session) setUser(read(K.session, null));
  }), []);

  const login = useCallback((email, password) => {
    const users = read(K.users, []);
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase().trim());
    if (!u || u.password !== password) throw new Error('Invalid email or password');
    const session = { id: u.id, name: u.name, email: u.email, role: u.role };
    write(K.session, session);
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(() => { write(K.session, null); setUser(null); }, []);

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

/* -------------------------------------------------------------- ROUTER */
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}
const navigate = (path) => { window.location.hash = path; };

/* ==================================================================== */
/*                             SEED DATA                                */
/* ==================================================================== */
const DEFAULT_SETTINGS = {
  restaurantName: "Mabel's Table",
  tagline: 'Modern European Kitchen',
  currency: '$',
  taxRate: 8.5,
  serviceCharge: 5,
  prepMinutes: 20,
  requestMinutes: 3,
};

function baseUrl() {
  return window.location.origin + window.location.pathname;
}

function seed() {
  if (!localStorage.getItem(K.users)) {
    write(K.users, [{ id: 1, name: 'Restaurant Admin', email: 'admin@tableflow.app', password: 'admin123', role: 'admin' }]);
  }

  const existingSettings = read(K.settings, null);
  if (!existingSettings) {
    write(K.settings, { ...DEFAULT_SETTINGS, publicBaseUrl: baseUrl() });
  } else {
    const merged = { ...DEFAULT_SETTINGS, ...existingSettings };
    if (existingSettings.restaurantName === 'The Golden Fork') merged.restaurantName = "Mabel's Table";
    if (!merged.publicBaseUrl) merged.publicBaseUrl = baseUrl();
    if (JSON.stringify(merged) !== JSON.stringify(existingSettings)) {
      write(K.settings, merged);
    }
  }

  if (!localStorage.getItem(K.categories)) {
    const cats = [
      { id: 1, name: 'Starters', sort_order: 0 },
      { id: 2, name: 'Mains', sort_order: 1 },
      { id: 3, name: 'Desserts', sort_order: 2 },
      { id: 4, name: 'Drinks', sort_order: 3 },
    ];
    write(K.categories, cats);

    const sample = [
      { category_id: 1, name: 'Truffle Arancini', description: 'Crispy risotto balls, black truffle, parmesan cream', price: 11.5 },
      { category_id: 1, name: 'Burrata & Heirloom Tomato', description: 'Creamy burrata, basil oil, aged balsamic', price: 13.0 },
      { category_id: 1, name: 'Crispy Calamari', description: 'Lemon aioli, pickled chilli, sea salt', price: 12.0 },
      { category_id: 2, name: 'Truffle Mushroom Risotto', description: 'Arborio rice, wild mushrooms, parmesan, truffle oil', price: 21.0 },
      { category_id: 2, name: 'Grilled Atlantic Salmon', description: 'Asparagus, lemon butter, crushed new potatoes', price: 26.5 },
      { category_id: 2, name: 'Dry-Aged Ribeye', description: '250g ribeye, peppercorn sauce, triple-cooked chips', price: 34.0 },
      { category_id: 2, name: 'Herb Roast Chicken', description: 'Half chicken, rosemary jus, seasonal greens', price: 23.5 },
      { category_id: 2, name: 'Wild Mushroom Tagliatelle', description: 'Handmade pasta, porcini cream, thyme', price: 19.5 },
      { category_id: 3, name: 'Dark Chocolate Fondant', description: 'Molten centre, vanilla bean ice cream', price: 9.5 },
      { category_id: 3, name: 'Lemon Posset', description: 'Shortbread crumb, raspberry coulis', price: 8.0 },
      { category_id: 3, name: 'Affogato', description: 'Vanilla gelato, double espresso, amaretti', price: 7.0 },
      { category_id: 4, name: 'Sparkling Lemonade', description: 'Fresh lemon, mint, soda', price: 4.5 },
      { category_id: 4, name: 'Espresso', description: 'Double shot, single origin', price: 3.5 },
      { category_id: 4, name: 'House Red (Glass)', description: 'Tempranillo, Rioja', price: 8.5 },
      { category_id: 4, name: 'Craft Lager', description: 'Local brewery, 330ml', price: 6.0 },
    ];
    write(K.items, sample.map((s, i) => ({
      id: i + 1, ...s, image_url: '', tags: '', is_available: 1,
    })));
  }
  if (!localStorage.getItem(K.tables)) {
    const seats = [2, 2, 4, 4, 4, 4, 6, 6, 8, 2, 4, 10];
    const tables = [];
    for (let i = 1; i <= 12; i++) {
      tables.push({ id: i, code: 'T' + String(i).padStart(2, '0'), name: 'Table ' + i, seats: seats[i - 1], status: 'free' });
    }
    write(K.tables, tables);
  }
  if (!localStorage.getItem(K.orders)) write(K.orders, []);
  if (!localStorage.getItem(K.requests)) write(K.requests, []);
  if (!localStorage.getItem(K.feedback)) write(K.feedback, []);
}

/* ==================================================================== */
/*                              LANDING                                 */
/* ==================================================================== */
function Landing() {
  const { user } = useAuth();
  const features = [
    { I: 'qr',        t: 'Scan & Sit',      d: 'Every table has a unique QR code. Guests scan and the menu opens instantly.' },
    { I: 'utensils',  t: 'Order & Top-up',  d: 'Place an order, then add more rounds later — all in real time.' },
    { I: 'bell',      t: 'One-tap Service', d: 'Call a waiter, ask for water, or any custom request without moving.' },
    { I: 'receipt',   t: 'Request the Bill',d: 'Guests signal they are ready to pay. Staff are notified instantly.' },
    { I: 'chart',     t: 'Live Admin Board',d: 'A kanban board that moves orders from pending to served with a tap.' },
    { I: 'smartphone',t: 'Built for Phones',d: 'Mobile-first design that feels native in the hand.' },
  ];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
            <Icon name="utensils" size={18} className="text-white" />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-white">Mabel's Table</span>
        </div>
        <a href={user ? '#/admin' : '#/login'} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
          {user ? 'Open Dashboard' : 'Staff Login'}
          <Icon name="arrow-right" size={13} />
        </a>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur">
            <Icon name="sparkles" size={12} className="text-fuchsia-400" />
            Real-time table service, zero friction
          </div>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
            Your guests never have to
            <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent"> leave the table </span>
            again.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Mabel's Table turns every table into a self-service point of sale. Guests scan a QR code to browse, order, top-up and request the bill. Your team sees everything live, in one beautiful board.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={user ? '#/admin' : '#/login'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 sm:w-auto">
              <Icon name="chart" size={15} />
              Enter Admin Dashboard
            </a>
            <a href="#/t/T01" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 sm:w-auto">
              <Icon name="qr" size={15} />
              Try Demo Table (T01)
            </a>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ I, t, d }) => (
            <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.06]">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02]">
                <Icon name={I} size={18} className="text-indigo-300" />
              </div>
              <h3 className="text-base font-bold text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500">
        Mabel's Table — Digital Table Assistant Platform
        <p className="mt-1.5 text-[11px] text-slate-600">Powered by TableFlow</p>
      </footer>
    </div>
  );
}

/* ==================================================================== */
/*                               LOGIN                                  */
/* ==================================================================== */
function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('admin@tableflow.app');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState('');

  useEffect(() => { if (user) navigate('/admin'); }, [user]);

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    try {
      login(email, password);
      toast('Welcome back!');
      navigate('/admin');
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <a href="#/" className="mb-8 flex items-center justify-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
            <Icon name="utensils" size={19} className="text-white" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white">Mabel's Table</span>
        </a>

        <div className="animate-fade-in rounded-2xl border border-white/10 bg-white/[0.035] p-7 backdrop-blur-xl sm:p-8">
          <h1 className="text-2xl font-black tracking-tight text-white">Staff sign in</h1>
          <p className="mt-1.5 text-sm text-slate-400">Access the live orders and service dashboard.</p>

          {err && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</label>
              <div className="relative">
                <Icon name="mail" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                       className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
                       placeholder="you@restaurant.com" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
              <div className="relative">
                <Icon name="lock" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                       className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
                       placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110">
              Sign in
              <Icon name="arrow-right" size={15} />
            </button>
          </form>

          <div className="mt-7 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
            <Icon name="shield-check" size={15} className="mt-0.5 shrink-0 text-emerald-400" />
            <p className="text-xs leading-relaxed text-slate-400">
              Demo credentials:
              <span className="ml-1 font-semibold text-slate-200">admin@tableflow.app</span> /
              <span className="ml-1 font-semibold text-slate-200">admin123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*                        PHONE GATE (NEW)                              */
/* ==================================================================== */
function PhoneGate({ table, settings, onSubmit }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      setErr('Please enter a valid phone number (at least 7 digits).');
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const customer = {
        phone: digits,
        name: name.trim() || `Guest ${digits.slice(-4)}`,
        visits: 1,
        firstVisitAt: nowISO(),
        lastVisitAt: nowISO(),
      };
      onSubmit(customer);
    }, 350);
  };

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-xl shadow-indigo-500/30">
            <Icon name="utensils" size={26} className="text-white" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight text-white">{settings.restaurantName || "Mabel's Table"}</p>
            <p className="text-xs text-slate-400">Table {table.name} · {table.seats} seats</p>
          </div>
        </div>

        <div className="animate-fade-in rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-xl sm:p-8">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80">
            <Icon name="sparkles" size={11} className="text-fuchsia-400" />
            Welcome
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Welcome to {settings.restaurantName || "Mabel's Table"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Please share your phone number so we can serve you better. We'll remember you next time you visit.
          </p>

          {err && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Phone number *</label>
              <div className="relative">
                <Icon name="phone" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="tel"
                  required
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0244 123 456"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Your name (optional)</label>
              <div className="relative">
                <Icon name="user" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kwame"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? <Icon name="loader" size={15} className="animate-spin-slow" /> : null}
              {busy ? 'Saving…' : 'Continue to Menu'}
              {!busy && <Icon name="arrow-right" size={15} />}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-500">
            We only use your number to recognise you on future visits and to send a quick thank-you after your meal.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*                       FEEDBACK MODAL (NEW)                           */
/* ==================================================================== */
function FeedbackModal({ open, onClose, customer, lastOrder, table, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(5);
      setComment('');
      setBusy(false);
      setDone(false);
    }
  }, [open]);

  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => {
      onSubmit({ rating, comment, lastOrderId: lastOrder?.id });
      setDone(true);
      setTimeout(() => { onClose(); }, 1600);
    }, 350);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center px-4">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur" />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl animate-fade-in">
        {done ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/30">
              <Icon name="check" size={30} className="text-white" stroke={3} />
            </div>
            <h3 className="text-xl font-black text-white">Thank you!</h3>
            <p className="mt-2 text-sm text-slate-400">
              Your feedback helps us serve you better. See you again soon! 💜
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600/25 via-fuchsia-600/15 to-transparent p-6">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90">
                  <Icon name="heart" size={11} />
                  We value your feedback
                </div>
                <h3 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white">
                  How was your meal{lastOrder ? `, ${customer?.name?.split(' ')[0]}` : ''}?
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  {lastOrder ? `Thanks for your recent order ${lastOrder.code}. ` : ''}
                  We'd love to hear what you think.
                </p>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Your rating</p>
                <div className="flex items-center justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={`transition ${n <= rating ? 'scale-110 text-amber-400' : 'text-slate-700 hover:text-slate-500'}`}
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    >
                      <Icon name="star" size={38} stroke={n <= rating ? 0 : 2} className={n <= rating ? 'fill-amber-400' : ''} />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-sm font-bold text-amber-300">
                  {['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'][rating - 1]}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Anything else? (optional)
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what you loved or what we could improve…"
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex flex-[1.6] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? <Icon name="loader" size={15} className="animate-spin-slow" /> : <Icon name="send" size={15} />}
                  Submit Feedback
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ==================================================================== */
/*                          CUSTOMER APP — OUTER                        */
/* ==================================================================== */
function CustomerApp({ code }) {
  const [tables] = useStore(K.tables, []);
  const [settings] = useStore(K.settings, DEFAULT_SETTINGS);
  const [customer, setCustomer] = useState(() => read(K.customer, null));

  const table = useMemo(() => tables.find((t) => t.code === code), [tables, code]);

  const handleGateSubmit = useCallback((c) => {
    const previous = read(K.customer, null);
    const isSamePhone = previous && previous.phone === c.phone;
    const next = {
      ...c,
      visits: isSamePhone ? (previous.visits || 1) + 1 : 1,
      firstVisitAt: isSamePhone ? previous.firstVisitAt : nowISO(),
      lastVisitAt: nowISO(),
    };
    write(K.customer, next);
    setCustomer(next);
  }, []);

  if (!table) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/15">
            <Icon name="alert-circle" size={22} className="text-rose-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Table not found</h1>
          <p className="mt-2 text-sm text-slate-400">The table code "{code}" is not recognised.</p>
          <a href="#/" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
            Go home
          </a>
        </div>
      </div>
    );
  }

  if (!customer) {
    return <PhoneGate table={table} settings={settings} onSubmit={handleGateSubmit} />;
  }

  return <CustomerAppInner code={code} table={table} settings={settings} customer={customer} />;
}

/* ==================================================================== */
/*                          CUSTOMER APP — INNER                        */
/* ==================================================================== */
const ORDER_FLOW = {
  pending:   { label: 'Sent to kitchen',         icon: 'clock',        cls: 'text-amber-300' },
  preparing: { label: 'Being prepared',          icon: 'chef',         cls: 'text-sky-300' },
  served:    { label: 'Served to your table',    icon: 'utensils',     cls: 'text-indigo-300' },
  completed: { label: 'Completed',               icon: 'check-circle', cls: 'text-emerald-300' },
  cancelled: { label: 'Cancelled',               icon: 'x-circle',     cls: 'text-rose-300' },
};

function CustomerAppInner({ code, table, settings, customer }) {
  const toast = useToast();
  const [items]    = useStore(K.items, []);
  const [cats]     = useStore(K.categories, []);
  const [orders, setOrders] = useStore(K.orders, []);
  const [requests] = useStore(K.requests, []);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(iv);
  }, []);

  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [query, setQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customMsg, setCustomMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Upgrade the "visits" counter once per session if it's been >6h since last visit
  useEffect(() => {
    const now = Date.now();
    const lastVisit = customer.lastVisitAt ? new Date(customer.lastVisitAt).getTime() : 0;
    const sixHours = 6 * 60 * 60 * 1000;
    if (now - lastVisit > sixHours) {
      const updated = {
        ...customer,
        visits: (customer.visits || 1) + 1,
        lastVisitAt: new Date().toISOString(),
      };
      write(K.customer, updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show a welcome toast once on mount
  useEffect(() => {
    const firstName = (customer.name || '').split(' ')[0];
    if (customer.visits > 1) {
      setTimeout(() => toast(`Welcome back, ${firstName}! 👋`, { tone: 'success', duration: 5000 }), 600);
    } else {
      setTimeout(() => toast(`Welcome, ${firstName}! 🍽️`, { tone: 'success', duration: 4500 }), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = settings.currency || '$';
  const tableOrders = useMemo(
    () => orders.filter((o) => o.table_id === table.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [orders, table.id]
  );
  const activeOrders = tableOrders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');

  const myRequests = useMemo(() => {
    return requests
      .filter((r) => r.table_id === table.id)
      .filter((r) => {
        if (r.status !== 'resolved') return true;
        const resolvedAt = new Date(r.updated_at || r.created_at).getTime();
        return now - resolvedAt < RESOLVED_VISIBLE_MS;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6);
  }, [requests, table.id, now]);

  /* Order status change → toast */
  const prevStatusesRef = useRef({});
  useEffect(() => {
    const prev = prevStatusesRef.current;
    const next = {};
    for (const o of orders) {
      if (o.table_id !== table.id) continue;
      next[o.id] = o.status;
      const old = prev[o.id];
      if (old && old !== o.status) {
        if (o.status === 'preparing')
          toast(`👨‍🍳 Order ${o.code} — kitchen is preparing it now`, { tone: 'info', duration: 4000 });
        else if (o.status === 'served')
          toast(`🍽️ Order ${o.code} has been served. Enjoy!`,        { tone: 'success', duration: 4500 });
        else if (o.status === 'completed')
          toast(`✅ Order ${o.code} completed. Thank you!`,           { tone: 'success', duration: 4000 });
        else if (o.status === 'cancelled')
          toast(`❌ Order ${o.code} was cancelled`,                   { tone: 'error', duration: 4000 });
      }
    }
    prevStatusesRef.current = next;
  }, [orders, table.id, toast]);

  /* Request status change → toast */
  const prevReqRef = useRef({});
  useEffect(() => {
    const prev = prevReqRef.current;
    const next = {};
    for (const r of requests) {
      if (r.table_id !== table.id) continue;
      next[r.id] = r.status;
      const old = prev[r.id];
      if (old && old !== r.status) {
        if (r.status === 'acknowledged')
          toast(`👋 Your ${(REQ_META[r.type] || REQ_META.custom).label.toLowerCase()} request is being handled`, { tone: 'info', duration: 3500 });
        else if (r.status === 'resolved')
          toast(`✅ ${(REQ_META[r.type] || REQ_META.custom).label} request completed`, { tone: 'success', duration: 3500 });
      }
    }
    prevReqRef.current = next;
  }, [requests, table.id, toast]);

  /* Feedback auto-trigger:
     - No active orders
     - No pending requests
     - At least one completed order (within last hour)
     - Feedback not yet given for that order
     - Fires 30s after the last state change (approximates "customer is leaving") */
  useEffect(() => {
    if (feedbackOpen) return;
    if (activeOrders.length > 0) return;
    if (myRequests.some((r) => r.status !== 'resolved')) return;

    const lastCompleted = tableOrders.find((o) => o.status === 'completed');
    if (!lastCompleted) return;

    const completedAgo = Date.now() - new Date(lastCompleted.updated_at || lastCompleted.created_at).getTime();
    if (completedAgo > 60 * 60 * 1000) return; // more than 1h ago — skip

    const given = read(K.feedbackGiven, {});
    if (given[lastCompleted.id]) return;

    const timer = setTimeout(() => setFeedbackOpen(true), 30000);
    return () => clearTimeout(timer);
  }, [feedbackOpen, activeOrders.length, myRequests, tableOrders]);

  const submitFeedback = ({ rating, comment, lastOrderId }) => {
    const fb = {
      id: uid(),
      phone: customer.phone,
      name: customer.name,
      tableId: table.id,
      tableCode: table.code,
      tableName: table.name,
      rating,
      comment: comment.trim(),
      at: nowISO(),
    };
    const all = read(K.feedback, []);
    write(K.feedback, [fb, ...all]);

    if (lastOrderId) {
      const given = read(K.feedbackGiven, {});
      given[lastOrderId] = true;
      write(K.feedbackGiven, given);
    }

    toast('Thank you for your feedback! 💜', { tone: 'success', duration: 4000 });
  };

  const addToCart = (item) => {
    setCart((c) => ({ ...c, [item.id]: { item, qty: (c[item.id]?.qty || 0) + 1 } }));
    toast(`${item.name} added`);
  };
  const changeQty = (id, d) => setCart((c) => {
    const line = c[id]; if (!line) return c;
    const qty = line.qty + d;
    if (qty <= 0) { const copy = { ...c }; delete copy[id]; return copy; }
    return { ...c, [id]: { ...line, qty } };
  });

  const lines = Object.values(cart);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * Number(l.item.price || 0), 0);
  const serviceFee = subtotal * (Number(settings.serviceCharge || 0) / 100);
  const tax = (subtotal + serviceFee) * (Number(settings.taxRate || 0) / 100);
  const total = subtotal + serviceFee + tax;

  const placeOrder = () => {
    if (!lines.length) return;
    setBusy(true);
    setTimeout(() => {
      const totalItems = lines.reduce((s, l) => s + l.qty, 0);
      const eta_at = computeOrderEta(totalItems, settings.prepMinutes);

      const order = {
        id: uid(),
        code: 'ORD-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
        table_id: table.id,
        table_name: table.name,
        table_code: table.code,
        status: 'pending',
        kind: 'order',
        note,
        subtotal, service_fee: serviceFee, tax, total,
        customer_phone: customer.phone,
        customer_name: customer.name,
        items: lines.map((l) => ({ id: uid(), menu_item_id: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty, note: '' })),
        eta_at,
        created_at: nowISO(),
        updated_at: nowISO(),
      };
      setOrders((prev) => [order, ...prev]);
      const nextTables = read(K.tables, []).map((t) => t.id === table.id ? { ...t, status: 'seated' } : t);
      write(K.tables, nextTables);

      setCart({});
      setNote('');
      setCartOpen(false);
      setBusy(false);
      toast(
        `📨 Order ${order.code} sent! Estimated ready by ${fmtTime(new Date(eta_at))}`,
        { tone: 'success', duration: 5000 }
      );
      broadcast({ type: 'notify', channel: 'admin', event: 'order:new', payload: order });
    }, 200);
  };

  /* NEW: "Add More Items" — just closes the cart and scrolls to the menu.
     Cart contents are preserved so the guest can keep adding. */
  const addMoreItems = () => {
    setCartOpen(false);
    setTimeout(() => {
      const menuEl = document.getElementById('menu-section');
      if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  };

  const cancelOrder = (order) => {
    if (order.status !== 'pending') return toast('Already being prepared');
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'cancelled', updated_at: nowISO() } : o));
    broadcast({ type: 'notify', channel: 'admin', event: 'order:update', payload: { ...order, status: 'cancelled' } });
    toast('Order cancelled', { tone: 'warn' });
  };

  const sendRequest = (type, message = '') => {
    const eta_at = new Date(Date.now() + (Number(settings.requestMinutes) || DEFAULT_REQ_MIN) * 60000).toISOString();
    const req = {
      id: uid(),
      table_id: table.id,
      table_name: table.name,
      table_code: table.code,
      type,
      message,
      status: 'pending',
      eta_at,
      customer_phone: customer.phone,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    write(K.requests, [req, ...read(K.requests, [])]);
    broadcast({ type: 'notify', channel: 'admin', event: 'request:new', payload: req });
    const nextTables = read(K.tables, []).map((t) => t.id === table.id ? { ...t, status: 'needs_attention' } : t);
    write(K.tables, nextTables);

    const labels = {
      waiter: 'A waiter is on the way 👋',
      bill: 'Bill request sent 🧾',
      water: 'Water is coming 💧',
      assistance: 'Someone will be right with you',
      custom: 'Your request was sent',
    };
    toast(labels[type] || 'Request sent', { tone: 'success' });
    setCustomOpen(false);
    setCustomMsg('');
  };

  const visibleCats = useMemo(() => {
    if (query.trim()) {
      const q = query.toLowerCase();
      return cats.map((c) => ({
        ...c,
        items: items.filter((i) => i.category_id === c.id &&
          (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))),
      })).filter((c) => c.items.length);
    }
    if (activeCat === 'all') {
      return cats.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) }));
    }
    return cats.filter((c) => c.id === activeCat).map((c) => ({
      ...c, items: items.filter((i) => i.category_id === c.id),
    }));
  }, [cats, items, activeCat, query]);

  const firstName = (customer.name || '').split(' ')[0];
  const isReturning = customer.visits > 1;

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
              <Icon name="utensils" size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-white">{settings.restaurantName || "Mabel's Table"}</p>
              <p className="truncate text-xs text-slate-400">
                Table {table.name} · Hi {firstName}
                {isReturning ? ` · visit #${customer.visits}` : ''}
              </p>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 hover:bg-white/10" title="Refresh">
            <Icon name="refresh" size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {/* Welcome back banner */}
        <section className="mt-4">
          <div className={`flex items-center gap-3 rounded-2xl border p-3 backdrop-blur-xl ${
            isReturning
              ? 'border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.12] to-transparent'
              : 'border-indigo-500/25 bg-gradient-to-r from-indigo-500/[0.12] to-transparent'
          }`}>
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              isReturning ? 'bg-emerald-500/20' : 'bg-indigo-500/20'
            }`}>
              <Icon name={isReturning ? 'heart' : 'sparkles'} size={15} className={isReturning ? 'text-emerald-300' : 'text-indigo-300'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                {isReturning ? `Welcome back, ${firstName}! 👋` : `Welcome, ${firstName}! 🍽️`}
              </p>
              <p className="text-[11px] text-slate-400">
                {isReturning
                  ? `Great to see you again — this is visit #${customer.visits}`
                  : `We're glad you're here — enjoy your meal.`}
              </p>
            </div>
          </div>
        </section>

        {/* Hero */}
        <section className="mt-4">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/25 via-fuchsia-600/15 to-transparent p-6">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90">
                <Icon name="sparkles" size={11} />
                {isReturning ? `Welcome back, ${firstName}` : 'Welcome'}
              </div>
              <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                {isReturning ? `Good to see you again, ${firstName}.` : "Sit back — we'll take it from here."}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
                Browse the menu, order, top-up and request the bill right from your seat.
              </p>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { type: 'waiter', label: 'Call Waiter', I: 'bell',    cls: 'from-indigo-500/25 to-indigo-500/5 border-indigo-400/25' },
            { type: 'bill',   label: 'Request Bill', I: 'receipt', cls: 'from-emerald-500/25 to-emerald-500/5 border-emerald-400/25' },
            { type: 'water',  label: 'Water',        I: 'droplet', cls: 'from-sky-500/25 to-sky-500/5 border-sky-400/25' },
            { type: 'custom', label: 'Other',        I: 'message-plus', cls: 'from-fuchsia-500/25 to-fuchsia-500/5 border-fuchsia-400/25' },
          ].map(({ type, label, I, cls }) => (
            <button key={type}
                    onClick={() => type === 'custom' ? setCustomOpen(true) : sendRequest(type)}
                    className={`group flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b ${cls} px-3 py-4 text-center transition active:scale-[0.97]`}>
              <Icon name={I} size={20} className="text-white transition group-hover:scale-110" />
              <span className="text-xs font-bold text-white">{label}</span>
            </button>
          ))}
        </section>

        {/* Active orders */}
        {activeOrders.length > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Your orders</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-bold uppercase text-indigo-300">
                {activeOrders.length} active
              </span>
            </div>
            <div className="space-y-3">
              {activeOrders.map((order) => {
                const flow = ORDER_FLOW[order.status] || ORDER_FLOW.pending;
                const eta = getOrderEta(order, settings);
                const countdown = etaCountdown(eta, now);
                const createdAt = new Date(order.created_at).getTime();
                const totalMs = Math.max(1, eta.getTime() - createdAt);
                const elapsedMs = now - createdAt;
                const progress = Math.min(100, Math.max(4, (elapsedMs / totalMs) * 100));
                const showEta = order.status === 'pending' || order.status === 'preparing';
                return (
                  <div key={order.id} className="animate-fade-in rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 ${flow.cls}`}>
                          <Icon name={flow.icon} size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Order · {order.code}</p>
                          <p className={`text-xs font-semibold ${flow.cls}`}>{flow.label}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-white">{money(order.total, currency)}</p>
                        <p className="text-[11px] text-slate-500">{timeAgo(order.created_at)}</p>
                      </div>
                    </div>

                    {showEta && (
                      <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Icon name="clock" size={13} className="text-amber-300" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              {order.status === 'preparing' ? 'Ready in' : 'Estimated ready'}
                            </span>
                          </div>
                          <span className={`text-xs font-extrabold ${countdown.overdue ? 'text-emerald-300' : 'text-white'}`}>
                            {countdown.overdue
                              ? 'Any moment now'
                              : `~${countdown.remainingMin} min · ${fmtTime(eta)}`}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                              countdown.overdue
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                                : 'bg-gradient-to-r from-indigo-500 to-fuchsia-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {order.status === 'served' && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5">
                        <Icon name="utensils" size={14} className="text-indigo-300" />
                        <span className="text-xs font-semibold text-indigo-200">
                          Served at {fmtTime(order.updated_at || nowISO())} — enjoy your meal 🍽️
                        </span>
                      </div>
                    )}

                    <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                      {order.items?.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300">
                            <span className="mr-2 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white">{it.qty}×</span>
                            {it.name}
                          </span>
                          <span className="text-slate-400">{money(it.price * it.qty, currency)}</span>
                        </div>
                      ))}
                    </div>

                    {order.status === 'pending' && (
                      <button onClick={() => cancelOrder(order)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">
                        <Icon name="x" size={13} />
                        Cancel order
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Requests tracker */}
        {myRequests.length > 0 && (
          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Your requests</h2>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${
                myRequests.some((r) => r.status !== 'resolved')
                  ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
              }`}>
                {myRequests.filter((r) => r.status !== 'resolved').length} pending
              </span>
            </div>
            <div className="space-y-2">
              {myRequests.map((r) => {
                const meta = REQ_META[r.type] || REQ_META.custom;
                const eta = getRequestEta(r, settings);
                const countdown = etaCountdown(eta, now);
                const reqCreatedAt = new Date(r.created_at).getTime();
                const reqTotalMs = Math.max(1, eta.getTime() - reqCreatedAt);
                const reqProgress = Math.min(95, Math.max(8, ((now - reqCreatedAt) / reqTotalMs) * 100));

                const isResolved    = r.status === 'resolved';
                const isAck         = r.status === 'acknowledged';
                const isOverdue     = !isResolved && !isAck && countdown.overdue;

                const statusText =
                  isResolved ? `✓ Delivered${r.updated_at ? ` · ${clockTime(r.updated_at)}` : ''}`
                  : isAck ? 'On the way'
                  : isOverdue ? 'Arriving soon'
                  : `~${countdown.remainingMin} min`;

                const statusColor =
                  isResolved ? 'text-emerald-300'
                  : isAck ? 'text-indigo-300'
                  : isOverdue ? 'text-amber-300 animate-pulse'
                  : 'text-amber-300';

                const barColor =
                  isResolved ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                  : isAck ? 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                  : 'bg-gradient-to-r from-amber-500 to-amber-400';

                const barWidth = isResolved ? 100 : isAck ? 85 : reqProgress;

                return (
                  <div key={r.id}
                       className={`animate-fade-in rounded-2xl border p-3 backdrop-blur-xl transition ${
                         isResolved
                           ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
                           : isOverdue
                             ? 'border-amber-500/30 bg-amber-500/[0.06]'
                             : 'border-white/10 bg-white/[0.035]'
                       }`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 ${
                          isResolved ? 'bg-emerald-500/15' : 'bg-white/5'
                        }`}>
                          <Icon
                            name={isResolved ? 'check-circle' : meta.icon}
                            size={15}
                            className={isResolved ? 'text-emerald-300' : 'text-amber-300'}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">
                            {meta.label} request
                            {isResolved && <span className="ml-1.5 text-[10px] font-bold uppercase text-emerald-300">· Done</span>}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Sent {timeAgo(r.created_at)}
                            {r.message ? ` · "${r.message.slice(0, 30)}${r.message.length > 30 ? '…' : ''}"` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-extrabold ${statusColor}`}>
                        {statusText}
                      </span>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {isOverdue && (
                      <p className="mt-1.5 text-[10px] font-semibold text-amber-300">
                        ⏱️ Taking a bit longer than usual — please be patient.
                      </p>
                    )}
                    {isResolved && (
                      <p className="mt-1.5 text-[10px] font-semibold text-emerald-300">
                        ✅ Request completed by our team.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* MENU */}
        <section id="menu-section" className="mt-8 scroll-mt-20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Menu</h2>
            <span className="text-[11px] font-semibold text-slate-500">
              {items.filter((i) => i.is_available).length} items available
            </span>
          </div>

          <div className="relative mb-4">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Search dishes and drinks…"
                   className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          {!query && (
            <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
              <button onClick={() => setActiveCat('all')}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${activeCat === 'all' ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/25' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                All
              </button>
              {cats.map((c) => (
                <button key={c.id} onClick={() => setActiveCat(c.id)}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${activeCat === c.id ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/25' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {visibleCats.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-14 text-center backdrop-blur-xl">
              <Icon name="utensils" size={26} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-400">No items found.</p>
            </div>
          )}

          <div className="space-y-6">
            {visibleCats.map((cat) => (
              <div key={cat.id}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <h3 className="text-lg font-black uppercase tracking-tight text-white">{cat.name}</h3>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {cat.items.filter((i) => i.is_available).length} items
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {cat.items.map((item) => {
                    const inCart = cart[item.id]?.qty || 0;
                    const unavailable = !item.is_available;
                    return (
                      <div
                        key={item.id}
                        className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl transition ${
                          unavailable ? 'opacity-55' : 'hover:border-white/25 hover:bg-white/[0.06] hover:shadow-2xl hover:shadow-black/30'
                        }`}
                      >
                        <div className="relative aspect-[5/4] w-full overflow-hidden bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-slate-700">
                              <Icon name="utensils" size={34} />
                            </div>
                          )}

                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

                          {unavailable ? (
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-rose-500/50 bg-rose-600/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                              Sold out
                            </span>
                          ) : inCart > 0 ? (
                            <span className="absolute left-2 top-2 grid h-6 min-w-[24px] place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-1.5 text-[11px] font-black text-white shadow-lg shadow-indigo-500/40">
                              {inCart}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-1 flex-col p-2.5">
                          <p className="line-clamp-2 text-[13px] font-extrabold leading-tight text-white">
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-400">
                              {item.description}
                            </p>
                          )}

                          <div className="mt-auto pt-2.5">
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-sm font-black text-amber-300">
                                {money(item.price, currency)}
                              </span>
                              {inCart > 0 && !unavailable && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                                  {inCart} in cart
                                </span>
                              )}
                            </div>

                            {unavailable ? (
                              <div className="w-full rounded-full border border-slate-500/30 bg-slate-500/15 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Sold out
                              </div>
                            ) : inCart > 0 ? (
                              <div className="flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 p-0.5">
                                <button
                                  onClick={() => changeQty(item.id, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                  className="grid h-7 w-7 place-items-center rounded-full text-white transition hover:bg-white/15 active:scale-90"
                                >
                                  <Icon name="minus" size={13} stroke={2.6} />
                                </button>
                                <span className="w-6 text-center text-sm font-black text-white">{inCart}</span>
                                <button
                                  onClick={() => changeQty(item.id, 1)}
                                  aria-label={`Add one more ${item.name}`}
                                  className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30 transition hover:brightness-110 active:scale-90"
                                >
                                  <Icon name="plus" size={13} stroke={2.6} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(item)}
                                aria-label={`Add ${item.name} to cart`}
                                className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 active:scale-[0.97]"
                              >
                                Place Order Now
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer — feedback link */}
        <section className="mt-10 mb-4 text-center">
          <button
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
          >
            <Icon name="heart" size={13} />
            Enjoyed your visit? Leave feedback
          </button>
          <p className="mt-3 text-[11px] text-slate-600">
            Dining with us as <span className="font-semibold text-slate-400">{customer.name}</span> · {customer.phone}
          </p>
        </section>
      </main>

      {/* Floating cart bar */}
      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-4">
          <button onClick={() => setCartOpen(true)}
                  className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-4 shadow-2xl shadow-indigo-500/40 active:scale-[0.99]">
            <div className="flex items-center gap-3">
              <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-white/20">
                <Icon name="bag" size={17} className="text-white" />
                <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-black text-indigo-600">{count}</span>
              </div>
              <span className="text-sm font-extrabold text-white">View your order</span>
            </div>
            <span className="text-base font-black text-white">{money(total, currency)}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900/95 shadow-2xl animate-slide-up">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-base font-extrabold text-white">Your order</h3>
                <p className="text-xs text-slate-400">Table {table.name} · {count} item{count === 1 ? '' : 's'}</p>
              </div>
              <button onClick={() => setCartOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {lines.length === 0 ? (
                <div className="py-12 text-center">
                  <Icon name="bag" size={28} className="mx-auto mb-3 text-slate-600" />
                  <p className="text-sm text-slate-400">Your cart is empty.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {lines.map(({ item, qty }) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-slate-600"><Icon name="utensils" size={16} /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{money(item.price, currency)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 p-0.5">
                        <button onClick={() => changeQty(item.id, -1)} className="grid h-7 w-7 place-items-center rounded-full text-white hover:bg-white/10"><Icon name="minus" size={13} /></button>
                        <span className="w-5 text-center text-sm font-extrabold text-white">{qty}</span>
                        <button onClick={() => changeQty(item.id, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Icon name="plus" size={13} /></button>
                      </div>
                      <span className="w-16 text-right text-sm font-extrabold text-white">{money(item.price * qty, currency)}</span>
                    </div>
                  ))}

                  <div className="pt-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Note for the kitchen (optional)</label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                              placeholder="Allergies, preferences, timing…"
                              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <div
                className="shrink-0 border-t border-white/10 bg-slate-950/70 px-5 pt-4"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
              >
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money(subtotal, currency)}</span></div>
                  {Number(settings.serviceCharge) > 0 && (
                    <div className="flex justify-between text-slate-400"><span>Service charge ({settings.serviceCharge}%)</span><span>{money(serviceFee, currency)}</span></div>
                  )}
                  {Number(settings.taxRate) > 0 && (
                    <div className="flex justify-between text-slate-400"><span>Tax ({settings.taxRate}%)</span><span>{money(tax, currency)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-white/10 pt-2 text-base font-black text-white">
                    <span>Total</span><span>{money(total, currency)}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                  <Icon name="clock" size={13} className="shrink-0 text-amber-300" />
                  <p className="text-[11px] text-amber-200">
                    Estimated ready by{' '}
                    <span className="font-bold">
                      {fmtTime(new Date(Date.now() + ((Number(settings.prepMinutes) || DEFAULT_PREP_MIN) + Math.min(15, lines.reduce((s, l) => s + l.qty, 0) * 1.5)) * 60000))}
                    </span>
                    {' '}(~{Math.round((Number(settings.prepMinutes) || DEFAULT_PREP_MIN) + Math.min(15, lines.reduce((s, l) => s + l.qty, 0) * 1.5))} min)
                  </p>
                </div>

                <div className="mt-3 flex gap-2.5">
                  <button
                    onClick={addMoreItems}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    <Icon name="plus" size={14} /> Add More Items
                  </button>
                  <button
                    onClick={placeOrder}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? <Icon name="loader" size={14} className="animate-spin-slow" /> : <Icon name="send" size={14} />}
                    Send Order Now
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  "Add More Items" keeps your cart open so you can keep browsing.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom request modal */}
      {customOpen && (
        <div className="fixed inset-0 z-[65] grid place-items-end sm:place-items-center">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setCustomOpen(false)} />
          <div className="relative w-full max-w-md animate-slide-up rounded-t-3xl border border-white/10 bg-slate-900/95 p-6 sm:animate-fade-in sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-white">Send a request</h3>
                <p className="mt-0.5 text-sm text-slate-400">Tell us what you need, table {table.name}.</p>
              </div>
              <button onClick={() => setCustomOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                <Icon name="x" size={18} />
              </button>
            </div>
            <textarea autoFocus rows={4} value={customMsg} onChange={(e) => setCustomMsg(e.target.value)}
                      placeholder="e.g. Could we get an extra chair and some napkins?"
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20" />
            <button onClick={() => sendRequest('custom', customMsg)} disabled={!customMsg.trim()}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 disabled:opacity-50">
              <Icon name="send" size={15} /> Send request
            </button>
          </div>
        </div>
      )}

      {/* Feedback modal */}
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        customer={customer}
        table={table}
        lastOrder={tableOrders.find((o) => o.status === 'completed') || null}
        onSubmit={submitFeedback}
      />
    </div>
  );
}

/* ==================================================================== */
/*                          ADMIN LAYOUT                                */
/* ==================================================================== */
const ADMIN_NAV = [
  { path: '/admin',           label: 'Dashboard',   icon: 'layout' },
  { path: '/admin/orders',    label: 'Orders',      icon: 'receipt' },
  { path: '/admin/requests',  label: 'Requests',    icon: 'bell' },
  { path: '/admin/feedback',  label: 'Feedback',    icon: 'heart' },
  { path: '/admin/menu',      label: 'Menu',        icon: 'utensils' },
  { path: '/admin/tables',    label: 'Tables & QR', icon: 'qr' },
  { path: '/admin/settings',  label: 'Settings',    icon: 'gear' },
];

function AdminLayout({ current, children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const onFirstClick = () => { primeAudio(); window.removeEventListener('click', onFirstClick); };
    window.addEventListener('click', onFirstClick);
    return () => window.removeEventListener('click', onFirstClick);
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      if (!sessionStorage.getItem('tf_notif_asked')) {
        sessionStorage.setItem('tf_notif_asked', '1');
        setTimeout(() => { try { Notification.requestPermission(); } catch {} }, 1500);
      }
    }
  }, []);

  useEffect(() => subscribe((msg) => {
    if (msg?.type !== 'notify' || msg.channel !== 'admin') return;
    if (msg.event === 'order:new') {
      const o = msg.payload;
      toast(`🔔 New order · Table ${o.table_name}`, { tone: 'success', duration: 5000 });
      playDing();
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`🔔 New order · Table ${o.table_name}`, {
            body: `${o.items?.length || 0} items · ${o.code}`,
            tag: `order-${o.id}`,
          });
        } catch {}
      }
    } else if (msg.event === 'request:new') {
      const r = msg.payload;
      toast(`🔔 ${r.type === 'bill' ? 'Bill requested' : 'Service request'} · Table ${r.table_name}`, { tone: 'warn', duration: 5000 });
      playChime();
    } else if (msg.event === 'feedback:new') {
      const f = msg.payload;
      toast(`💜 New ${f.rating}-star feedback from ${f.name}`, { tone: 'success', duration: 5000 });
    }
  }), [toast]);

  const nav = (
    <div className="flex h-full flex-col">
      <a href="#/" className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
          <Icon name="utensils" size={17} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-white">Mabel's Table</p>
          <p className="text-[11px] text-slate-500">Admin Console</p>
        </div>
      </a>
      <nav className="flex-1 space-y-1 px-3">
        {ADMIN_NAV.map(({ path, label, icon }) => {
          const active = current === path;
          return (
            <a key={path} href={`#${path}`} onClick={() => setOpen(false)}
               className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active ? 'bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/10 text-white ring-1 ring-inset ring-indigo-400/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}>
              <Icon name={icon} size={17} />
              {label}
            </a>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 text-xs font-black text-white">
            {user?.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">{user?.name || 'Admin'}</p>
            <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
          </div>
        </div>
        <button onClick={() => { logout(); navigate('/login'); }}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 hover:bg-rose-500/10 hover:text-rose-300">
          <Icon name="log-out" size={16} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-slate-950/60 backdrop-blur-xl lg:block">
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in border-r border-white/10 bg-slate-950">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              <Icon name="x" size={18} />
            </button>
            {nav}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur-xl lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300">
            <Icon name="menu-burger" size={18} />
          </button>
          <span className="text-sm font-extrabold text-white">Mabel's Table Admin</span>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*                          ADMIN DASHBOARD                             */
/* ==================================================================== */
function Dashboard() {
  const [orders] = useStore(K.orders, []);
  const [requests, setRequests] = useStore(K.requests, []);
  const [tables] = useStore(K.tables, []);
  const [items] = useStore(K.items, []);
  const [feedback] = useStore(K.feedback, []);
  const [settings] = useStore(K.settings, DEFAULT_SETTINGS);
  const toast = useToast();

  const [inspectingTableId, setInspectingTableId] = useState(null);

  const currency = settings.currency || '$';
  const today = new Date().toDateString();

  const stats = useMemo(() => {
    const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === today);
    const active = orders.filter((o) => o.status === 'pending' || o.status === 'preparing');
    const pendingReq = requests.filter((r) => r.status === 'pending');
    const rev = todayOrders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
    const occupied = tables.filter((t) => t.status !== 'free').length;
    const avgRating = feedback.length
      ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length)
      : 0;
    return { revenueToday: rev, ordersToday: todayOrders.length, activeOrders: active.length, pendingRequests: pendingReq.length, occupied, tables: tables.length, avgRating, feedbackCount: feedback.length };
  }, [orders, requests, tables, today, feedback]);

  const cards = [
    { label: "Today's revenue", value: money(stats.revenueToday, currency), I: 'receipt',   tone: 'from-emerald-500/25 to-emerald-500/5 border-emerald-400/25', text: 'text-emerald-300' },
    { label: 'Orders today',    value: stats.ordersToday,                   I: 'receipt',   tone: 'from-indigo-500/25 to-indigo-500/5 border-indigo-400/25',  text: 'text-indigo-300' },
    { label: 'Active orders',   value: stats.activeOrders,                  I: 'utensils',  tone: 'from-sky-500/25 to-sky-500/5 border-sky-400/25',           text: 'text-sky-300' },
    { label: 'Pending requests',value: stats.pendingRequests,               I: 'bell',      tone: 'from-amber-500/25 to-amber-500/5 border-amber-400/25',     text: 'text-amber-300' },
  ];

  const recentOrders = useMemo(() => orders.slice(0, 8), [orders]);
  const pendingRequests = useMemo(() => requests.filter((r) => r.status === 'pending').slice(0, 6), [requests]);
  const recentFeedback = useMemo(() => feedback.slice(0, 3), [feedback]);

  const tableSummaries = useMemo(() => {
    const map = {};
    for (const t of tables) {
      const tOrders = orders.filter((o) =>
        o.table_id === t.id && (o.status === 'pending' || o.status === 'preparing' || o.status === 'served')
      );
      const tRequests = requests.filter((r) => r.table_id === t.id && r.status !== 'resolved');
      map[t.id] = {
        activeOrders: tOrders,
        pendingRequests: tRequests,
        ordersCount: tOrders.length,
        requestsCount: tRequests.length,
      };
    }
    return map;
  }, [tables, orders, requests]);

  const inspectingTable = useMemo(
    () => tables.find((t) => t.id === inspectingTableId) || null,
    [tables, inspectingTableId]
  );
  const inspectingSummary = inspectingTable ? tableSummaries[inspectingTable.id] : null;

  const markRequestStatus = (req, status) => {
    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status, updated_at: nowISO() } : r));
    if (status === 'resolved') {
      const still = read(K.requests, []).some(
        (r) => r.table_id === req.table_id && r.id !== req.id && r.status !== 'resolved'
      );
      const stillSeated = read(K.orders, []).some(
        (o) => o.table_id === req.table_id && (o.status === 'pending' || o.status === 'preparing' || o.status === 'served')
      );
      if (!still && !stillSeated) {
        const nextTables = read(K.tables, []).map((t) => t.id === req.table_id ? { ...t, status: 'free' } : t);
        write(K.tables, nextTables);
      }
    }
    broadcast({ type: 'notify', channel: 'table', tableId: req.table_id, event: 'request:update', payload: { ...req, status } });
    toast(`Request marked ${status}`, { tone: status === 'resolved' ? 'success' : 'info' });
  };

  const avgStars = Math.round(stats.avgRating);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">Live overview of {settings.restaurantName || "Mabel's Table"}.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, I, tone, text }) => (
          <div key={label} className={`rounded-2xl border bg-gradient-to-br ${tone} p-5 backdrop-blur-xl`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{value}</p>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 ${text}`}>
                <Icon name={I} size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Feedback summary strip */}
      {stats.feedbackCount > 0 && (
        <div className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-r from-fuchsia-500/[0.10] to-transparent p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/15">
                <Icon name="heart" size={22} className="text-fuchsia-300" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer satisfaction</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map((n) => (
                      <Icon key={n} name="star" size={16}
                            stroke={n <= avgStars ? 0 : 2}
                            className={n <= avgStars ? 'fill-amber-400 text-amber-400' : 'text-slate-700'} />
                    ))}
                  </div>
                  <span className="text-lg font-black text-white">{stats.avgRating.toFixed(1)}</span>
                  <span className="text-xs text-slate-400">from {stats.feedbackCount} review{stats.feedbackCount > 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            <a href="#/admin/feedback" className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-bold text-fuchsia-200 hover:bg-fuchsia-500/20">
              View all <Icon name="arrow-right" size={12} />
            </a>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-white">Floor status</h2>
                <p className="text-xs text-slate-400">
                  {stats.occupied} of {stats.tables} tables occupied · click a tile for details
                </p>
              </div>
              <a href="#/admin/tables" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                Manage <Icon name="arrow-right" size={12} />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {tables.map((t) => {
                const summary = tableSummaries[t.id] || { ordersCount: 0, requestsCount: 0 };
                const hasAttention = summary.requestsCount > 0 || t.status === 'needs_attention';
                const hasOrders = summary.ordersCount > 0;
                const interactive = hasAttention || hasOrders;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => interactive && setInspectingTableId(t.id)}
                    disabled={!interactive}
                    className={`relative rounded-2xl border p-3.5 text-left transition ${
                      t.status === 'free' && !hasAttention
                        ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
                        : t.status === 'needs_attention' || hasAttention
                          ? 'border-amber-500/40 bg-amber-500/[0.09] ' + (interactive ? 'hover:bg-amber-500/[0.14] cursor-pointer' : '')
                          : 'border-indigo-500/25 bg-indigo-500/[0.08] ' + (interactive ? 'hover:bg-indigo-500/[0.14] cursor-pointer' : '')
                    } ${interactive ? 'active:scale-[0.98]' : 'cursor-default'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-white">{t.name}</span>
                      <StatusDot status={hasAttention ? 'needs_attention' : t.status} />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {hasAttention ? 'Needs attention' : t.status.replace('_', ' ')}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {summary.requestsCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-200">
                          <Icon name="bell" size={9} stroke={3} />
                          {summary.requestsCount} request{summary.requestsCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {summary.ordersCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-200">
                          <Icon name="receipt" size={9} stroke={3} />
                          {summary.ordersCount} order{summary.ordersCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {interactive && (
                      <span className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                        <Icon name="chevron-right" size={10} />
                        Tap for details
                      </span>
                    )}
                  </button>
                );
              })}
              {tables.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-slate-500">No tables yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white">Needs attention</h2>
            <a href="#/admin/requests" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">All</a>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="py-10 text-center">
              <Icon name="bell" size={24} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">All clear. No pending requests.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingRequests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setInspectingTableId(r.table_id)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge meta={REQ_META[r.type] || REQ_META.custom} />
                    <span className="text-[11px] text-slate-500">{timeAgo(r.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">Table {r.table_name}</p>
                  {r.message && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{r.message}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-white">Recent orders</h2>
          <a href="#/admin/orders" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
            Open board <Icon name="arrow-right" size={12} />
          </a>
        </div>
        {recentOrders.length === 0 ? (
          <div className="py-12 text-center">
            <Icon name="receipt" size={26} className="mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-500">No orders yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2.5 font-bold">Order</th>
                  <th className="pb-2.5 font-bold">Table</th>
                  <th className="pb-2.5 font-bold">Customer</th>
                  <th className="pb-2.5 font-bold">Status</th>
                  <th className="pb-2.5 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="text-slate-300">
                    <td className="py-3">
                      <p className="font-semibold text-white">{o.code}</p>
                      <p className="text-[11px] text-slate-500">{timeAgo(o.created_at)}</p>
                    </td>
                    <td className="py-3 font-semibold text-slate-200">{o.table_name}</td>
                    <td className="py-3 text-slate-400">
                      {o.customer_name || '—'}
                      {o.customer_phone && <p className="text-[10px] text-slate-500">{o.customer_phone}</p>}
                    </td>
                    <td className="py-3"><Badge meta={ORDER_META[o.status] || ORDER_META.pending} /></td>
                    <td className="py-3 text-right font-bold text-white">{money(o.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent feedback */}
      {recentFeedback.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white">Recent feedback</h2>
            <a href="#/admin/feedback" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
              View all <Icon name="arrow-right" size={12} />
            </a>
          </div>
          <div className="space-y-2">
            {recentFeedback.map((f) => (
              <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{f.name}</span>
                    <span className="text-[10px] text-slate-500">{f.tableName}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map((n) => (
                      <Icon key={n} name="star" size={12}
                            stroke={n <= f.rating ? 0 : 2}
                            className={n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'} />
                    ))}
                  </div>
                </div>
                {f.comment && (
                  <p className="mt-2 text-xs italic text-slate-400">"{f.comment}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={!!inspectingTable}
        onClose={() => setInspectingTableId(null)}
        title={inspectingTable ? `${inspectingTable.name} · details` : 'Table details'}
        subtitle={inspectingTable ? `${inspectingTable.seats} seats · ${inspectingTable.code}` : ''}
        size="md"
      >
        {!inspectingTable || !inspectingSummary ? (
          <p className="text-sm text-slate-400">No details available.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.08] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active orders</p>
                <p className="mt-1 text-xl font-black text-white">{inspectingSummary.ordersCount}</p>
              </div>
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending requests</p>
                <p className="mt-1 text-xl font-black text-white">{inspectingSummary.requestsCount}</p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <Icon name="bell" size={14} className="text-amber-300" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  Service requests
                </h3>
              </div>

              {inspectingSummary.pendingRequests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 py-6 text-center">
                  <p className="text-xs text-slate-500">No pending requests for this table.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inspectingSummary.pendingRequests.map((r) => {
                    const meta = REQ_META[r.type] || REQ_META.custom;
                    const eta = getRequestEta(r, settings);
                    const countdown = etaCountdown(eta, Date.now());
                    const isOverdue = countdown.overdue && r.status === 'pending';
                    return (
                      <div key={r.id} className={`rounded-xl border p-3 ${
                        isOverdue
                          ? 'border-amber-500/30 bg-amber-500/[0.06]'
                          : 'border-white/10 bg-white/[0.03]'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                              <Icon name={meta.icon} size={14} className="text-amber-300" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-white">{meta.label} request</p>
                              <p className="text-[10px] text-slate-500">
                                {timeAgo(r.created_at)} · {r.status}
                                {r.status === 'pending' && (
                                  countdown.overdue
                                    ? ' · overdue'
                                    : ` · ~${countdown.remainingMin}m`
                                )}
                              </p>
                            </div>
                          </div>
                          <Badge meta={meta} />
                        </div>
                        {r.message && (
                          <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs italic text-slate-300">
                            "{r.message}"
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          {r.status === 'pending' && (
                            <button
                              onClick={() => markRequestStatus(r, 'acknowledged')}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"
                            >
                              <Icon name="check" size={12} /> Acknowledge
                            </button>
                          )}
                          <button
                            onClick={() => markRequestStatus(r, 'resolved')}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110"
                          >
                            <Icon name="check-circle" size={12} />
                            {r.type === 'bill' ? 'Bill delivered' : 'Mark delivered'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {inspectingSummary.activeOrders.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Icon name="receipt" size={14} className="text-indigo-300" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Active orders
                  </h3>
                </div>
                <div className="space-y-2">
                  {inspectingSummary.activeOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">Order · {o.code}</p>
                        <p className="text-[10px] text-slate-500">
                          {o.items?.length || 0} items · {timeAgo(o.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge meta={ORDER_META[o.status] || ORDER_META.pending} />
                        <span className="text-sm font-black text-white">{money(o.total, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <a
                  href="#/admin/orders"
                  onClick={() => setInspectingTableId(null)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                >
                  <Icon name="arrow-right" size={12} />
                  Open orders board for full control
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ==================================================================== */
/*                          ORDERS BOARD                                */
/* ==================================================================== */
const BOARD_COLUMNS = [
  { key: 'pending',   label: 'Pending',   icon: 'clock',         tone: 'text-amber-300',   ring: 'ring-amber-500/25',  bg: 'from-amber-500/10' },
  { key: 'preparing', label: 'Preparing', icon: 'chef',          tone: 'text-sky-300',     ring: 'ring-sky-500/25',    bg: 'from-sky-500/10' },
  { key: 'served',    label: 'Served',    icon: 'utensils',      tone: 'text-indigo-300',  ring: 'ring-indigo-500/25', bg: 'from-indigo-500/10' },
  { key: 'completed', label: 'Completed', icon: 'check-circle',  tone: 'text-emerald-300', ring: 'ring-emerald-500/25',bg: 'from-emerald-500/10' },
];
const NEXT_STATUS = { pending: 'preparing', preparing: 'served', served: 'completed' };
const BUTTON_LABEL = {
  preparing: '👨‍🍳 Start preparing',
  served:    '🍽️ Mark served',
  completed: '✅ Mark completed',
};

function OrdersBoard() {
  const [orders, setOrders] = useStore(K.orders, []);
  const [tables] = useStore(K.tables, []);
  const [settings] = useStore(K.settings, DEFAULT_SETTINGS);
  const [tableFilter, setTableFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const toast = useToast();

  const currency = settings.currency || '$';
  const filtered = tableFilter === 'all' ? orders : orders.filter((o) => String(o.table_id) === tableFilter);

  const grouped = useMemo(() => {
    const g = { pending: [], preparing: [], served: [], completed: [], cancelled: [] };
    for (const o of filtered) (g[o.status] || g.pending).push(o);
    return g;
  }, [filtered]);

  const updateStatus = (order, status) => {
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status, updated_at: nowISO() } : o));

    const others = read(K.orders, []);
    const stillActive = others.some((o) =>
      o.table_id === order.table_id && o.id !== order.id &&
      (o.status === 'pending' || o.status === 'preparing' || o.status === 'served')
    );
    const nextTables = read(K.tables, []).map((t) =>
      t.id === order.table_id
        ? { ...t, status: stillActive ? 'seated' : (status === 'completed' || status === 'cancelled' ? 'free' : 'seated') }
        : t
    );
    write(K.tables, nextTables);

    broadcast({ type: 'notify', channel: 'table', tableId: order.table_id, event: 'order:update', payload: { ...order, status } });
    broadcast({ type: 'notify', channel: 'admin', event: 'order:update', payload: { ...order, status } });

    playDing();

    const messages = {
      preparing: `👨‍🍳 ${order.code} — preparing`,
      served:    `🍽️ ${order.code} — served`,
      completed: `✅ ${order.code} — completed`,
      cancelled: `❌ ${order.code} — cancelled`,
    };
    toast(messages[status] || `Order ${order.code} → ${status}`, {
      tone: status === 'cancelled' ? 'error' : 'success',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Orders board</h1>
          <p className="mt-1 text-sm text-slate-400">
            Tap the big button on any card to move it to the next stage. The customer's phone updates automatically.
          </p>
        </div>
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-100 outline-none">
          <option value="all">All tables</option>
          {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {BOARD_COLUMNS.map(({ key, label, icon, tone, ring, bg }) => (
          <div key={key} className="flex min-w-0 flex-col">
            <div className={`mb-3 flex items-center justify-between rounded-2xl bg-gradient-to-b ${bg} to-transparent px-4 py-3 ring-1 ring-inset ${ring}`}>
              <div className="flex items-center gap-2">
                <Icon name={icon} size={15} className={tone} />
                <span className="text-sm font-extrabold text-white">{label}</span>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-black text-white">{grouped[key].length}</span>
            </div>

            <div className="space-y-3">
              {grouped[key].length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
                  <p className="text-xs text-slate-600">Empty</p>
                </div>
              )}
              {grouped[key].map((o) => {
                const isOpen = expanded === o.id;
                const nextStatus = NEXT_STATUS[o.status];
                return (
                  <div key={o.id} className="animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
                    <button onClick={() => setExpanded(isOpen ? null : o.id)} className="w-full px-4 pt-4 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-extrabold text-white">Table {o.table_name}</span>
                          <p className="mt-0.5 text-[11px] text-slate-500">{o.code} · {clockTime(o.created_at)} · {timeAgo(o.created_at)}</p>
                        </div>
                        <span className="text-sm font-black text-white">{money(o.total, currency)}</span>
                      </div>
                      {!isOpen && (
                        <p className="mt-2 truncate text-xs text-slate-400">
                          {o.items?.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </p>
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-1 pt-3">
                        <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          {o.items?.map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs">
                              <span className="text-slate-300">
                                <span className="mr-1.5 inline-block rounded bg-white/10 px-1.5 py-0.5 font-bold text-white">{it.qty}×</span>
                                {it.name}
                              </span>
                              <span className="text-slate-400">{money(it.price * it.qty, currency)}</span>
                            </div>
                          ))}
                          {o.note && (
                            <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">Note: {o.note}</div>
                          )}
                          {o.customer_name && (
                            <div className="mt-2 text-[11px] text-slate-500">Customer: {o.customer_name} · {o.customer_phone}</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 p-3">
                      {nextStatus ? (
                        <button
                          onClick={() => updateStatus(o, nextStatus)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 active:scale-[0.98]"
                        >
                          {BUTTON_LABEL[nextStatus]}
                          <Icon name="chevron-right" size={13} />
                        </button>
                      ) : (
                        <span className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Order closed
                        </span>
                      )}

                      {o.status !== 'cancelled' && o.status !== 'completed' && (
                        <button
                          onClick={() => {
                            if (confirm(`Cancel order ${o.code}? This will notify the customer.`)) {
                              updateStatus(o, 'cancelled');
                            }
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 p-2 text-rose-300 hover:bg-rose-500/10"
                          title="Cancel this order"
                        >
                          <Icon name="x-circle" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {grouped.cancelled.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-400">Cancelled ({grouped.cancelled.length})</h2>
          <div className="space-y-2">
            {grouped.cancelled.slice(0, 8).map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 text-sm">
                <span className="text-slate-400"><span className="font-semibold text-slate-300">Table {o.table_name}</span> · {o.code}</span>
                <span className="text-slate-500 line-through">{money(o.total, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/*                         REQUESTS PAGE                                */
/* ==================================================================== */
function RequestsPage() {
  const [requests, setRequests] = useStore(K.requests, []);
  const [filter, setFilter] = useState('pending');
  const toast = useToast();

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  const setStatus = (req, status) => {
    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status, updated_at: nowISO() } : r));
    const still = read(K.requests, []).some((r) => r.table_id === req.table_id && r.id !== req.id && r.status !== 'resolved');
    if (!still) {
      const stillSeated = read(K.orders, []).some(
        (o) => o.table_id === req.table_id && (o.status === 'pending' || o.status === 'preparing' || o.status === 'served')
      );
      if (!stillSeated) {
        const nextTables = read(K.tables, []).map((t) => t.id === req.table_id ? { ...t, status: 'free' } : t);
        write(K.tables, nextTables);
      }
    }
    toast(`Request marked ${status}`, { tone: status === 'resolved' ? 'success' : 'info' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Service requests</h1>
        <p className="mt-1 text-sm text-slate-400">
          Waiter calls, bill requests and custom asks — resolve them here to clear the guest's card.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'pending',      label: 'Pending' },
          { key: 'acknowledged', label: 'Acknowledged' },
          { key: 'resolved',     label: 'Resolved' },
          { key: 'all',          label: 'All' },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${filter === f.key ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-20 text-center backdrop-blur-xl">
          <Icon name="inbox" size={30} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No {filter !== 'all' ? filter : ''} requests right now.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className="animate-fade-in rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
                    <Icon name="bell" size={17} className="text-amber-300" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-white">Table {r.table_name}</p>
                    <p className="text-[11px] text-slate-500">{timeAgo(r.created_at)}</p>
                  </div>
                </div>
                <Badge meta={REQ_META[r.type] || REQ_META.custom} />
              </div>

              {r.message && (
                <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-slate-300">{r.message}</p>
              )}

              <div className="mt-3 flex items-center gap-2">
                {r.status === 'pending' && (
                  <button onClick={() => setStatus(r, 'acknowledged')}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    <Icon name="check" size={12} /> Acknowledge
                  </button>
                )}
                {r.status !== 'resolved' && (
                  <button onClick={() => setStatus(r, 'resolved')}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white">
                    <Icon name="check-circle" size={12} /> Resolve
                  </button>
                )}
                {r.status === 'resolved' && (
                  <span className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/15 py-2 text-center text-[11px] font-bold uppercase text-emerald-300">Resolved</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/*                        FEEDBACK PAGE (NEW)                           */
/* ==================================================================== */
function FeedbackPage() {
  const [feedback] = useStore(K.feedback, []);
  const [filterStars, setFilterStars] = useState(0);

  const filtered = useMemo(() => {
    if (filterStars === 0) return feedback;
    return feedback.filter((f) => f.rating === filterStars);
  }, [feedback, filterStars]);

  const avg = feedback.length
    ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length
    : 0;

  const distribution = useMemo(() => {
    const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of feedback) d[f.rating] = (d[f.rating] || 0) + 1;
    return d;
  }, [feedback]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Customer feedback</h1>
          <p className="mt-1 text-sm text-slate-400">
            {feedback.length} review{feedback.length === 1 ? '' : 's'} · average rating {avg.toFixed(1)} / 5
          </p>
        </div>
      </div>

      {/* Summary */}
      {feedback.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10">
                <Icon name="heart" size={26} className="text-fuchsia-300" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Average rating</p>
                <p className="mt-1 text-3xl font-black text-white">{avg.toFixed(1)}</p>
                <div className="mt-1 flex items-center gap-0.5">
                  {[1,2,3,4,5].map((n) => (
                    <Icon key={n} name="star" size={13}
                          stroke={n <= Math.round(avg) ? 0 : 2}
                          className={n <= Math.round(avg) ? 'fill-amber-400 text-amber-400' : 'text-slate-700'} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Rating distribution</p>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const pct = feedback.length ? (distribution[n] / feedback.length) * 100 : 0;
                return (
                  <button key={n} onClick={() => setFilterStars(filterStars === n ? 0 : n)}
                          className="flex w-full items-center gap-2 text-left">
                    <span className="w-6 text-xs font-bold text-slate-400">{n}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                           style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-[11px] font-bold text-slate-400">{distribution[n]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {feedback.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-20 text-center backdrop-blur-xl">
          <Icon name="heart" size={30} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No feedback yet. It'll show here when guests rate their visit.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-14 text-center backdrop-blur-xl">
          <p className="text-sm text-slate-400">No {filterStars}-star reviews.</p>
          <button onClick={() => setFilterStars(0)} className="mt-4 text-xs font-semibold text-indigo-300 hover:text-indigo-200">
            Clear filter
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => (
            <div key={f.id} className="animate-fade-in rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-black text-white">
                    {(f.name || 'G')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{f.name}</p>
                    <p className="text-[10px] text-slate-500">{f.tableName} · {timeAgo(f.at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map((n) => (
                    <Icon key={n} name="star" size={13}
                          stroke={n <= f.rating ? 0 : 2}
                          className={n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'} />
                  ))}
                </div>
              </div>
              {f.comment && (
                <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm italic leading-relaxed text-slate-300">
                  "{f.comment}"
                </p>
              )}
              <p className="mt-2 text-[10px] text-slate-500">{f.phone}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/*                        MENU MANAGER                                  */
/* ==================================================================== */
const EMPTY_ITEM = { name: '', description: '', price: '', category_id: '', image_url: '', is_available: 1 };

function MenuManager() {
  const [categories, setCategories] = useStore(K.categories, []);
  const [items, setItems] = useStore(K.items, []);
  const [settings] = useStore(K.settings, DEFAULT_SETTINGS);
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('all');

  const [itemModal, setItemModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);

  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState('');

  const currency = settings.currency || '$';

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_ITEM, category_id: activeCat !== 'all' ? activeCat : categories[0]?.id || '' });
    setItemModal(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name, description: item.description || '', price: String(item.price),
      category_id: item.category_id || '', image_url: item.image_url || '', is_available: item.is_available ? 1 : 0,
    });
    setItemModal(true);
  };

  const uploadImage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setForm((f) => ({ ...f, image_url: e.target.result }));
    reader.readAsDataURL(file);
  };

  const saveItem = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(), description: form.description, price: Number(form.price) || 0,
      category_id: form.category_id ? Number(form.category_id) : null,
      image_url: form.image_url, is_available: form.is_available ? 1 : 0,
    };
    if (editing) {
      setItems((prev) => prev.map((i) => i.id === editing.id ? { ...i, ...payload } : i));
      toast('Item updated');
    } else {
      setItems((prev) => [...prev, { id: uid(), ...payload }]);
      toast('Item created');
    }
    setItemModal(false);
  };

  const deleteItem = (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    toast('Item deleted');
  };

  const toggleAvailability = (item) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_available: i.is_available ? 0 : 1 } : i));
  };

  const createCategory = (e) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setCategories((prev) => [...prev, { id: uid(), name: catName.trim(), sort_order: prev.length }]);
    setCatName('');
    setCatModal(false);
    toast('Category created');
  };

  const deleteCategory = (cat) => {
    if (!confirm(`Delete category "${cat.name}"? Items will be uncategorised.`)) return;
    setItems((prev) => prev.map((i) => i.category_id === cat.id ? { ...i, category_id: null } : i));
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    toast('Category deleted');
  };

  const visible = useMemo(() => {
    let list = activeCat === 'all' ? items : items.filter((i) => String(i.category_id) === String(activeCat));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, activeCat, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Menu management</h1>
          <p className="mt-1 text-sm text-slate-400">{items.length} items across {categories.length} categories.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
            <Icon name="folder-plus" size={15} /> New category
          </button>
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110">
            <Icon name="plus" size={15} /> Add item
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu…"
                 className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60" />
        </div>
        <button onClick={() => setActiveCat('all')}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${activeCat === 'all' ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
          All
        </button>
        {categories.map((c) => (
          <div key={c.id} className="group relative">
            <button onClick={() => setActiveCat(c.id)}
                    className={`rounded-full py-2 pl-4 pr-9 text-sm font-bold transition ${String(activeCat) === String(c.id) ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
              {c.name}
            </button>
            <button onClick={() => deleteCategory(c)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 opacity-0 transition hover:text-rose-300 group-hover:opacity-100" title="Delete category">
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-20 text-center backdrop-blur-xl">
          <Icon name="utensils" size={28} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No items here yet.</p>
          <button onClick={openNew} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white">
            <Icon name="plus" size={15} /> Add your first item
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <div key={item.id} className="animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl transition hover:border-white/20">
              <div className="relative h-40 w-full overflow-hidden border-b border-white/10 bg-white/5">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-slate-700"><Icon name="utensils" size={30} /></div>
                )}
                <div className="absolute right-2.5 top-2.5">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur ${item.is_available ? 'border-emerald-500/40 bg-emerald-500/25 text-emerald-100' : 'border-rose-500/40 bg-rose-500/25 text-rose-100'}`}>
                    {item.is_available ? 'Available' : 'Sold out'}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-white">{item.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{item.description || 'No description'}</p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-white">{money(item.price, currency)}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => openEdit(item)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    <Icon name="pencil" size={12} /> Edit
                  </button>
                  <button onClick={() => toggleAvailability(item)} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10">
                    <Icon name={item.is_available ? 'eye-off' : 'eye'} size={13} />
                  </button>
                  <button onClick={() => deleteItem(item)} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-rose-300 hover:bg-rose-500/10">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={itemModal} onClose={() => setItemModal(false)}
             title={editing ? 'Edit menu item' : 'New menu item'}
             subtitle="This will appear on every table's digital menu.">
        <form onSubmit={saveItem} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Description</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Price *</label>
              <input required type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Category</label>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60">
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Image</label>
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {form.image_url ? (
                    <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-slate-700"><Icon name="image-plus" size={20} /></div>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
                  <Icon name="image-plus" size={15} /> Upload image
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
                </label>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <input type="checkbox" checked={!!form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked ? 1 : 0 })} className="h-4 w-4 accent-indigo-500" />
                <span className="text-sm font-semibold text-slate-200">Available for ordering</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setItemModal(false)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25">
              {editing ? 'Save changes' : 'Create item'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="New category"
             subtitle="Group your menu into sections like Starters, Mains, Drinks." size="sm">
        <form onSubmit={createCategory} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Category name *</label>
            <input autoFocus required value={catName} onChange={(e) => setCatName(e.target.value)}
                   className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder-slate-500 focus:border-indigo-400/60" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setCatModal(false)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ==================================================================== */
/*                       TABLES & QR MANAGER                            */
/* ==================================================================== */
function TablesManager() {
  const [tables, setTables] = useStore(K.tables, []);
  const [settings] = useStore(K.settings, DEFAULT_SETTINGS);
  const toast = useToast();

  const [editModal, setEditModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', seats: 4, status: 'free' });

  const [qrModal, setQrModal] = useState(false);
  const [qr, setQr] = useState(null);

  const openNew = () => {
    setEditing(null);
    setForm({ name: `Table ${tables.length + 1}`, seats: 4, status: 'free' });
    setEditModal(true);
  };
  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, seats: t.seats, status: t.status }); setEditModal(true); };

  const nextCode = () => {
    const used = new Set(tables.map((t) => t.code));
    let n = used.size + 1;
    let code = 'T' + String(n).padStart(2, '0');
    while (used.has(code)) { n++; code = 'T' + String(n).padStart(2, '0'); }
    return code;
  };

  const save = (e) => {
    e.preventDefault();
    if (editing) {
      setTables((prev) => prev.map((t) => t.id === editing.id ? { ...t, ...form, seats: Number(form.seats) } : t));
      toast('Table updated');
    } else {
      setTables((prev) => [...prev, { id: uid(), code: nextCode(), name: form.name, seats: Number(form.seats), status: form.status }]);
      toast('Table created');
    }
    setEditModal(false);
  };

  const remove = (t) => {
    if (!confirm(`Delete ${t.name}?`)) return;
    setTables((prev) => prev.filter((x) => x.id !== t.id));
    toast('Table deleted');
  };

  const showQr = (t) => {
    setQrModal(true);
    setQr(null);
    const settings2 = read(K.settings, {});
    const base = (settings2.publicBaseUrl || baseUrl()).replace(/\/$/, '').replace(/#.*$/, '');
    const url = `${base}#/t/${t.code}`;
    try {
      const dataUrl = generateQrDataUrl(url, 640);
      setQr({ url, dataUrl, table: t });
    } catch (e) {
      console.error('QR generation failed:', e);
      toast(e.message || 'Could not generate QR', { tone: 'error' });
      setQrModal(false);
    }
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr.dataUrl;
    a.download = `mabels-table-${qr.table.code}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyLink = async () => {
    if (!qr) return;
    try { await navigator.clipboard.writeText(qr.url); toast('Link copied'); }
    catch { toast('Copy failed', { tone: 'error' }); }
  };

  const base = (settings.publicBaseUrl || baseUrl()).replace(/\/$/, '').replace(/#.*$/, '');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Tables & QR codes</h1>
          <p className="mt-1 text-sm text-slate-400">Each table gets a unique QR code that opens its personal ordering page.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110">
          <Icon name="plus" size={15} /> Add table
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] py-20 text-center backdrop-blur-xl">
          <Icon name="armchair" size={28} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No tables yet.</p>
          <button onClick={openNew} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white">
            <Icon name="plus" size={15} /> Create your first table
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((t) => (
            <div key={t.id} className="animate-fade-in overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl transition hover:border-white/20">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <StatusDot status={t.status} />
                  <span className="text-sm font-extrabold text-white">{t.name}</span>
                </div>
                <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-black tracking-wider text-slate-300">{t.code}</span>
              </div>
              <div className="grid h-40 place-items-center bg-white/[0.02]">
                <QrThumb code={t.code} base={base} />
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><Icon name="users" size={12} /> {t.seats} seats</span>
                  <span className="capitalize">{t.status.replace('_', ' ')}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => showQr(t)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    <Icon name="qr" size={12} /> QR
                  </button>
                  <button onClick={() => openEdit(t)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    <Icon name="pencil" size={12} /> Edit
                  </button>
                  <button onClick={() => remove(t)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
                <a href={`#/t/${t.code}`} target="_blank" rel="noreferrer"
                   className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200">
                  <Icon name="external-link" size={11} /> Open customer view
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editModal} onClose={() => setEditModal(false)}
             title={editing ? `Edit ${editing.name}` : 'Add a table'} size="sm">
        <form onSubmit={save} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Table name *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                   className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Seats</label>
            <input type="number" min="1" max="30" value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
                   className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
          </div>
          {editing && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60">
                <option value="free">Free</option>
                <option value="seated">Seated</option>
                <option value="needs_attention">Needs attention</option>
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditModal(false)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white">{editing ? 'Save' : 'Create table'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={qrModal} onClose={() => { setQrModal(false); setQr(null); }}
             title={qr?.table ? `${qr.table.name} · QR code` : 'QR code'}
             subtitle="Print and place this on the table. Guests scan it to order." size="sm">
        {!qr ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <Icon name="loader" size={26} className="animate-spin-slow text-indigo-400" />
            <p className="text-sm text-slate-400">Generating QR…</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-xl">
              <img src={qr.dataUrl} alt="Table QR code" className="h-56 w-56" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Customer link</p>
              <p className="mt-1 break-all text-xs text-slate-300">{qr.url}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={copyLink} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
                <Icon name="copy" size={15} /> Copy link
              </button>
              <button onClick={downloadQr} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white">
                <Icon name="download" size={15} /> Download PNG
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function QrThumb({ code, base }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const url = `${base}#/t/${code}`;
    try {
      const d = generateQrDataUrl(url, 240);
      if (alive) setSrc(d);
    } catch (e) {
      console.error('QR thumb generation failed:', e);
      if (alive) setErr(e.message || 'QR failed');
    }
    return () => { alive = false; };
  }, [code, base]);

  if (err) {
    return (
      <div className="grid h-32 w-32 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/5 p-2 text-center text-[10px] text-rose-300">
        {err}
      </div>
    );
  }

  if (!src) return (
    <div className="grid h-32 w-32 place-items-center rounded-xl border border-white/10 bg-white/5">
      <Icon name="loader" size={18} className="animate-spin-slow text-slate-600" />
    </div>
  );

  return (
    <div className="rounded-xl bg-white p-2.5 shadow-lg">
      <img src={src} alt="QR" className="h-28 w-28" />
    </div>
  );
}

/* ==================================================================== */
/*                            SETTINGS                                  */
/* ==================================================================== */
function SettingsPage() {
  const [settings, setSettings] = useStore(K.settings, DEFAULT_SETTINGS);
  const [form, setForm] = useState(settings);
  const toast = useToast();

  useEffect(() => { setForm(settings); }, [settings]);

  const submit = (e) => {
    e.preventDefault();
    setSettings({
      ...form,
      taxRate: Number(form.taxRate) || 0,
      serviceCharge: Number(form.serviceCharge) || 0,
      prepMinutes: Number(form.prepMinutes) || DEFAULT_PREP_MIN,
      requestMinutes: Number(form.requestMinutes) || DEFAULT_REQ_MIN,
    });
    toast('Settings saved', { tone: 'success' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Configure your restaurant profile, pricing rules and QR link base.</p>
      </div>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"><Icon name="store" size={17} className="text-indigo-300" /></div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Restaurant profile</h2>
              <p className="text-xs text-slate-500">Shown to guests at the top of their menu.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Restaurant name</label>
              <input value={form.restaurantName || ''} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Tagline</label>
              <input value={form.tagline || ''} onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Currency symbol</label>
              <input value={form.currency || ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={4}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"><Icon name="percent" size={17} className="text-emerald-300" /></div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Pricing rules</h2>
              <p className="text-xs text-slate-500">Applied to every order automatically.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Service charge (%)</label>
              <input type="number" step="0.1" min="0" max="100" value={form.serviceCharge || 0} onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Tax / VAT (%)</label>
              <input type="number" step="0.1" min="0" max="100" value={form.taxRate || 0} onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                     className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-400">
              Example on a <span className="font-bold text-slate-200">{(form.currency || '$') + '100'}</span> order:
              service <span className="font-bold text-slate-200">{(form.currency || '$') + (100 * (Number(form.serviceCharge) || 0) / 100).toFixed(2)}</span>,
              tax <span className="font-bold text-slate-200">{(form.currency || '$') + (100 * (1 + (Number(form.serviceCharge) || 0) / 100) * (Number(form.taxRate) || 0) / 100).toFixed(2)}</span>.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl lg:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"><Icon name="clock" size={17} className="text-amber-300" /></div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Estimated times</h2>
              <p className="text-xs text-slate-500">Shown to guests as the ETA on their order and request cards.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Base kitchen prep time (minutes)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="120"
                value={form.prepMinutes ?? 20}
                onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Service response time (minutes)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="30"
                value={form.requestMinutes ?? 3}
                onChange={(e) => setForm({ ...form, requestMinutes: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl lg:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5"><Icon name="globe" size={17} className="text-sky-300" /></div>
            <div>
              <h2 className="text-sm font-extrabold text-white">QR link base URL</h2>
              <p className="text-xs text-slate-500">
                Where your hosted copy of this page lives. QR codes will point to <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-200">{(form.publicBaseUrl || baseUrl()).replace(/\/$/, '')}/#/t/&lt;code&gt;</code>
              </p>
            </div>
          </div>
          <div className="relative">
            <Icon name="link" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={form.publicBaseUrl || ''} onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
                   className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60"
                   placeholder={baseUrl()} />
          </div>
        </div>

        <div className="lg:col-span-2">
          <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25">
            <Icon name="save" size={15} /> Save settings
          </button>
        </div>
      </form>
    </div>
  );
}

/* ==================================================================== */
/*                              ROOT APP                                */
/* ==================================================================== */
function App() {
  const hash = useHash();
  const { user } = useAuth();

  const parts = hash.replace(/^\//, '').split('/').filter(Boolean);
  const top = parts[0] || '';

  useEffect(() => {
    if (top === 'admin' && !user) {
      navigate('/login');
    } else if (top === 'login' && user) {
      navigate('/admin');
    }
  }, [top, user]);

  if (top === 'admin' && !user) return null;
  if (top === 'login' && user) return null;

  if (top === 't' && parts[1]) return <CustomerApp code={parts[1]} />;
  if (top === 'login') return <Login />;

  if (top === 'admin') {
    const sub = parts[1] || '';
    const current = '/admin' + (sub ? '/' + sub : '');
    let page = <Dashboard />;
    if (sub === 'orders')   page = <OrdersBoard />;
    if (sub === 'requests') page = <RequestsPage />;
    if (sub === 'feedback') page = <FeedbackPage />;
    if (sub === 'menu')     page = <MenuManager />;
    if (sub === 'tables')   page = <TablesManager />;
    if (sub === 'settings') page = <SettingsPage />;
    return <AdminLayout current={current}>{page}</AdminLayout>;
  }

  return <Landing />;
}

/* ==================================================================== */
/*                               BOOT                                   */
/* ==================================================================== */
seed();

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <ToastProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ToastProvider>
);