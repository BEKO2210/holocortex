import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js";

window.THREE = THREE;
try { delete window.__THREE__; } catch (err) { window.__THREE__ = undefined; }

/* UI / copy */
const COPY = {
  saving: 'Saving\u2026',
  saved: 'Saved locally',
  saveFailed: 'Save failed. Export a backup.',
  created: 'Node created',
  deleted: 'Node deleted',
  exported: 'JSON exported',
  invalidJson: 'Invalid JSON file.',
  badVersion: 'Unsupported document version.',
  badNode: 'Invalid node data.',
  tooLargeNative: 'File too large. Maximum import size is 2 MB.',
  tooLargeGraphify: 'File too large. Maximum import size is 8 MB.',
  titleLong: 'Title is too long. Maximum length is 200 characters.',
  badUrl: 'Enter an http:// or https:// URL.',
  storageUnavailable: 'Local storage is unavailable. Changes are not saved.',
  storageCorrupt: 'Stored data could not be read. Import a backup or reset the network.',
  deps: 'Could not load dependencies. Check your connection and reload.',
  webgl: 'WebGL is unavailable in this browser.',
  untitled: 'Untitled node',
  emptyPreview: 'Your preview appears here',
  matchNote: 'Match in note',
  open: 'Open',
  done: 'Done'
};

const DIALOGS = {
  delete: { title: 'Delete node?', text: 'This cannot be undone.', ok: 'Delete node' },
  reset: {
    title: 'Reset network?',
    text: 'Delete all nodes stored by holocortex in this browser? Demo nodes will not return.',
    ok: 'Reset network'
  },
  import: {
    title: 'Replace network?',
    text: 'Importing will replace all current nodes. Export a backup first.',
    ok: 'Replace network'
  }
};

const TYPE = {
  thought: { color: '#39E7FF', radius: 4, icon: 'Brain', dom: 'brain', label: 'Thought', css: 'type-thought' },
  task: { color: '#F071DC', radius: 4.6, icon: 'CircleCheck', dom: 'circle-check', label: 'Task', css: 'type-task' },
  link: { color: '#A89CFF', radius: 3.7, icon: 'Link', dom: 'link', label: 'Link', css: 'type-link' },
  snippet: { color: '#F5C16C', radius: 4.1, icon: 'Code2', dom: 'code-2', label: 'Snippet', css: 'type-snippet' }
};

const STORAGE_KEY = 'holocortex.v1';
const SCAN_KEY = 'holocortex.v1.scan';
const NATIVE_LIMIT = 2 * 1024 * 1024;
const GRAPHIFY_LIMIT = 8 * 1024 * 1024;
const GRAPHIFY_NS = '7d9b2a4e-5c31-4f08-9a6e-1b0c3d5e7f90';
const FORBIDDEN_TAGS = new Set(['graphify', 'code', 'community']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(['thought', 'task', 'link', 'snippet']);

const $ = (id) => document.getElementById(id);
const searchEl = $('search');
const clearBtn = $('clear-search');
const resultsEl = $('results');
const resultsList = $('results-list');
const resultsCount = $('results-count');
const resultsEmpty = $('results-empty');
const hud = $('hud');
const titleEl = $('title');
const typeEl = $('type');
const tagInput = $('tag-input');
const chipsEl = $('chips');
const statusRow = $('status-row');
const statusOpen = $('status-open');
const statusDone = $('status-done');
const urlRow = $('url-row');
const urlEl = $('url');
const bodyEl = $('body');
const saveStateEl = $('save-state');
const badgeEl = $('badge');
const emptyEl = $('empty');
const bannerEl = $('banner');
const loadingEl = $('loading');
const toastEl = $('toast');
const tooltipEl = $('tooltip');
const tipTitle = $('tip-title');
const tipStatus = $('tip-status');
const tipTags = $('tip-tags');
const dialogRoot = $('dialog-root');
const dlgTitle = $('dlg-title');
const dlgText = $('dlg-text');
const dlgCancel = $('dlg-cancel');
const dlgOk = $('dlg-ok');
const dlgCount = $('dlg-count');
const fileEl = $('file-input');
const previewEl = $('preview');
const graphEl = $('graph');
const moreBtn = $('more-btn');
const moreMenu = $('more-menu');
const hoverFineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
const coarseQuery = window.matchMedia('(pointer: coarse)');

function canHoverFine() {
  return hoverFineQuery.matches;
}

function isCoarse() {
  return coarseQuery.matches;
}

const state = {
  doc: { version: 1, initialized: true, nodes: [] },
  selectedId: null,
  hoverId: null,
  query: '',
  hits: [],
  hitIds: new Set(),
  activeHit: -1,
  hudOpen: false,
  hudTrigger: null,
  dialog: null,
  dialogTrigger: null,
  pendingImport: null,
  tags: [],
  status: 'open',
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  sheetMode: 'edit',
  editorPanel: 'markdown',
  storageState: 'ok',
  graph: null,
  pointer: { x: 40, y: 40 },
  saveTimer: 0,
  previewTimer: 0,
  searchTimer: 0,
  toastTimer: 0,
  urlWarned: false,
  lastSaveOk: true,
  scanMemory: false
};

const objectMap = new Map();
const graphNodes = new Map();
const layoutSeed = new Map();
const geoCache = new Map();
const iconCache = new Map();
const plateCache = new Map();
const plateWorld = new THREE.Vector3();

const PREVIEW_CSS = [
  'html,body{margin:0;padding:12px;background:#071321;color:#E8F2FA;}',
  'body{font:400 14px/21px Inter,system-ui,sans-serif;overflow-wrap:anywhere;}',
  'h1{font-size:24px;line-height:32px;margin:0 0 8px;font-weight:600;}',
  'h2{font-size:22px;line-height:30px;margin:12px 0 8px;font-weight:600;}',
  'h3,h4,h5,h6{font-size:18px;line-height:26px;margin:10px 0 6px;font-weight:600;}',
  'p{margin:0 0 10px;}ul,ol{margin:0 0 10px;padding-left:1.25em;}li{margin:2px 0;}',
  'blockquote{margin:0 0 10px;padding:2px 0 2px 10px;border-left:2px solid #39E7FF;color:#A9BDCE;}',
  'code,pre{font:400 13px/21px "JetBrains Mono",ui-monospace,monospace;tab-size:2;}',
  'pre{margin:0 0 10px;padding:8px;overflow-x:auto;background:rgba(3,7,18,.72);border:1px solid rgba(57,231,255,.24);border-radius:8px;}',
  'table{border-collapse:collapse;width:100%;margin:0 0 10px;}',
  'th,td{border:1px solid rgba(57,231,255,.24);padding:4px 6px;text-align:left;vertical-align:top;}',
  'a{color:#39E7FF;text-decoration:underline;}',
  '.empty{color:#A9BDCE;margin:0;}input{accent-color:#39E7FF;}'
].join('');

function showBanner(message) {
  bannerEl.hidden = false;
  bannerEl.textContent = message;
}

function hideBanner() {
  bannerEl.hidden = true;
  bannerEl.textContent = '';
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2000);
}

function setSaveStatus(message, failed) {
  saveStateEl.textContent = message;
  saveStateEl.classList.toggle('is-error', Boolean(failed));
}

function paintIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/* Persistence / validation */
function emptyDoc() {
  return { version: 1, initialized: true, nodes: [] };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  return JSON.parse(source, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    return value;
  });
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return false;
  if (match[7] !== 'Z') {
    const tzHour = Number(match[8]);
    const tzMinute = Number(match[9]);
    if (tzHour > 23 || tzMinute > 59) return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  if (match[7] === 'Z') {
    const date = new Date(parsed);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return false;
    if (date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return false;
  }
  return true;
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function normalizeTags(tags) {
  const out = [];
  const seen = new Set();
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const next = tag.trim().toLowerCase();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function pairKey(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

function pushPair(list, seen, a, b) {
  if (!a || !b || a === b) return;
  const key = pairKey(a, b);
  if (seen.has(key)) return;
  seen.add(key);
  list.push(a < b ? { source: a, target: b } : { source: b, target: a });
}

function normalizeNode(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.toLowerCase() : '';
  if (!UUID_RE.test(id)) return null;
  if (!TYPES.has(raw.type)) return null;
  if (typeof raw.title !== 'string' || raw.title.length > 200) return null;
  if (typeof raw.body !== 'string') return null;
  if (!Array.isArray(raw.tags) || raw.tags.some((tag) => typeof tag !== 'string')) return null;
  if (!isIsoDate(raw.createdAt) || !isIsoDate(raw.updatedAt)) return null;
  const node = {
    id,
    type: raw.type,
    title: raw.title,
    body: raw.body,
    tags: normalizeTags(raw.tags),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  };
  if (raw.type === 'task') {
    if (raw.status !== 'open' && raw.status !== 'done') return null;
    node.status = raw.status;
  }
  if (raw.type === 'link' && Object.prototype.hasOwnProperty.call(raw, 'url')) {
    if (typeof raw.url !== 'string' || !isHttpUrl(raw.url)) return null;
    node.url = raw.url.trim();
  }
  return node;
}

function mapNative(data) {
  if (!isPlainObject(data) || data.version !== 1) return { error: COPY.badVersion };
  if (data.initialized !== true) return { error: COPY.badNode };
  if (!Array.isArray(data.nodes)) return { error: COPY.badNode };
  const hasConnect = Object.prototype.hasOwnProperty.call(data, 'connectBy');
  const connectBy = hasConnect ? data.connectBy : undefined;
  if (connectBy !== undefined && connectBy !== 'edges') return { error: COPY.badNode };
  const hasEdges = Object.prototype.hasOwnProperty.call(data, 'edges');
  if (hasEdges && connectBy !== 'edges') return { error: COPY.badNode };
  if (connectBy === 'edges' && hasEdges && !Array.isArray(data.edges)) return { error: COPY.badNode };
  const nodes = [];
  const ids = new Set();
  for (const raw of data.nodes) {
    const node = normalizeNode(raw);
    if (!node || ids.has(node.id)) return { error: COPY.badNode };
    ids.add(node.id);
    nodes.push(node);
  }
  const doc = { version: 1, initialized: true, nodes };
  if (connectBy === 'edges') {
    const edges = [];
    const seen = new Set();
    for (const raw of (Array.isArray(data.edges) ? data.edges : [])) {
      if (!isPlainObject(raw)) return { error: COPY.badNode };
      const source = typeof raw.source === 'string' ? raw.source.toLowerCase() : '';
      const target = typeof raw.target === 'string' ? raw.target.toLowerCase() : '';
      if (!UUID_RE.test(source) || !UUID_RE.test(target)) return { error: COPY.badNode };
      if (!ids.has(source) || !ids.has(target) || source === target) return { error: COPY.badNode };
      pushPair(edges, seen, source, target);
    }
    doc.connectBy = 'edges';
    doc.edges = edges;
  }
  return { doc };
}

function storedNode(node) {
  const clean = {
    id: node.id,
    type: node.type,
    title: node.title,
    body: node.body,
    tags: node.tags.slice(),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
  if (node.type === 'task') clean.status = node.status === 'done' ? 'done' : 'open';
  if (node.type === 'link' && node.url) clean.url = node.url;
  return clean;
}

function toDocument(doc) {
  const nodes = doc.nodes.map(storedNode);
  if (doc.connectBy === 'edges') {
    return {
      version: 1,
      initialized: true,
      connectBy: 'edges',
      nodes,
      edges: (doc.edges || []).map((edge) => ({ source: edge.source, target: edge.target }))
    };
  }
  return { version: 1, initialized: true, nodes };
}

function persist(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toDocument(doc)));
    state.storageState = 'ok';
    state.lastSaveOk = true;
    hideBanner();
    return true;
  } catch (err) {
    state.storageState = 'unavailable';
    state.lastSaveOk = false;
    showBanner(COPY.storageUnavailable);
    return false;
  }
}

function loadDocument() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    state.storageState = 'unavailable';
    state.doc = emptyDoc();
    showBanner(COPY.storageUnavailable);
    return;
  }
  if (raw === null) {
    state.doc = buildDemo();
    if (!persist(state.doc)) showBanner(COPY.storageUnavailable);
    return;
  }
  try {
    const mapped = mapNative(parseJson(raw));
    if (mapped.error) throw new Error(mapped.error);
    state.doc = mapped.doc;
  } catch (err) {
    state.storageState = 'corrupt';
    state.doc = emptyDoc();
    showBanner(COPY.storageCorrupt);
  }
}

function buildDemo() {
  const now = new Date().toISOString();
  const rows = [
    ['thought', 'Mapping a research question', '## Question\nHow do interruptions change deep work?', ['research', 'attention']],
    ['thought', 'Morning observation', 'Two uninterrupted hours felt more productive than four fragmented ones.', ['attention', 'journal']],
    ['task', 'Design a small experiment', '- [ ] Define a 25-minute session\n- [ ] Record interruptions', ['research', 'experiment'], 'open'],
    ['link', 'Open science practices', 'Use a preregistered question and keep the analysis reproducible.', ['research', 'methods'], null, 'https://www.cos.io/'],
    ['snippet', 'Count focus sessions', 'A minimal counter:\n\n```python\nsessions = [25, 25, 20]\nprint(sum(sessions))\n```', ['experiment', 'code']],
    ['thought', 'Keep the negative result', 'A failed hypothesis still narrows the search space.', ['methods', 'journal']],
    ['task', 'Write the first protocol', 'State the question, variables, and stopping rule.', ['methods', 'experiment'], 'done'],
    ['link', 'Markdown reference', 'Keep notes in a portable plain-text format.', ['writing', 'code'], null, 'https://commonmark.org/help/'],
    ['thought', 'From notes to synthesis', 'Connect observations before drafting a conclusion.', ['writing', 'research']],
    ['snippet', 'Normalize a tag', 'Normalize before connecting:\n\n```js\ntag.trim().toLowerCase()\n```', ['code', 'methods']]
  ];
  const positions = [
    [-80, 40, 50], [-48, 60, -30], [16, 28, 46], [80, 8, -22], [52, -36, 34],
    [-64, -20, -50], [4, -8, 12], [68, 52, 18], [-20, -56, 28], [12, 4, -42]
  ];
  const nodes = rows.map((row, index) => {
    const node = {
      id: '00000000-0000-4000-8000-00000000000' + (index + 1).toString(16),
      type: row[0],
      title: row[1],
      body: row[2],
      tags: row[3],
      createdAt: now,
      updatedAt: now
    };
    if (row[0] === 'task') node.status = row[4];
    if (row[0] === 'link') node.url = row[5];
    layoutSeed.set(node.id, {
      x: positions[index][0],
      y: positions[index][1],
      z: positions[index][2]
    });
    return node;
  });
  return { version: 1, initialized: true, nodes };
}

function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function sha1(bytes) {
  const ml = bytes.length;
  const withPad = new Uint8Array(((ml + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[ml] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 8, Math.floor(ml / 0x20000000), false);
  view.setUint32(withPad.length - 4, (ml << 3) >>> 0, false);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 80; t += 1) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t += 1) {
      let f;
      let k;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, index) => ov.setUint32(index * 4, h, false));
  return out;
}

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToUuid(bytes) {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function uuidv5(name) {
  const ns = uuidToBytes(GRAPHIFY_NS);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(ns.length + nameBytes.length);
  data.set(ns, 0);
  data.set(nameBytes, ns.length);
  const hash = sha1(data).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

function isTrueFlag(value) {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

function communityKey(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      const number = Number(trimmed);
      if (Number.isFinite(number)) return String(number);
    }
    return trimmed;
  }
  return '';
}

function fileBasename(path) {
  if (typeof path !== 'string') return '';
  const parts = path.trim().split(/[/\\]/);
  const base = parts[parts.length - 1];
  if (!base || base === '.' || base === '..') return '';
  return base;
}

function clipTitle(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const title = text || COPY.untitled;
  return title.length > 200 ? title.slice(0, 200) : title;
}

function isGraphify(data) {
  if (!isPlainObject(data) || data.version === 1) return false;
  const graph = data.graph;
  if (isPlainObject(graph) && graph.graphify_version != null && String(graph.graphify_version).trim() !== '') return true;
  const hasList = Array.isArray(data.links) || Array.isArray(data.edges);
  if (!hasList || !Array.isArray(data.nodes)) return false;
  return data.nodes.some((node) => isPlainObject(node) && (
    Object.prototype.hasOwnProperty.call(node, 'label') || Object.prototype.hasOwnProperty.call(node, 'source_file')
  ));
}

function optionalString(node, key) {
  if (!Object.prototype.hasOwnProperty.call(node, key) || node[key] == null) return true;
  return typeof node[key] === 'string';
}

function validFlag(value) {
  if (value === true || value === false) return true;
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  return text === 'true' || text === 'false';
}

function validCommunity(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim());
}

function validGraphifyNode(node) {
  if (!isPlainObject(node)) return false;
  if (typeof node.id !== 'string' || node.id.trim() === '') return false;
  if (typeof node.label !== 'string') return false;
  if (!optionalString(node, 'source_file') || !optionalString(node, 'source_location')) return false;
  if (!optionalString(node, 'file_type') || !optionalString(node, 'community_name')) return false;
  if (!optionalString(node, 'norm_label') || !optionalString(node, '_origin')) return false;
  if (Object.prototype.hasOwnProperty.call(node, 'community') && node.community != null && !validCommunity(node.community)) return false;
  if (Object.prototype.hasOwnProperty.call(node, '_callable') && node._callable != null && !validFlag(node._callable)) return false;
  if (Object.prototype.hasOwnProperty.call(node, '_callable_class') && node._callable_class != null && !validFlag(node._callable_class)) return false;
  return true;
}

function graphifyEdgeList(data) {
  if (Array.isArray(data.links)) return data.links;
  if (Array.isArray(data.edges)) return data.edges;
  return null;
}

function sourceBits(node) {
  const file = typeof node.source_file === 'string' ? node.source_file.trim() : '';
  const loc = node.source_location == null ? '' : String(node.source_location).trim();
  return [file, loc].filter(Boolean).join(' ');
}

function symbolBody(node, key) {
  const lines = [];
  const source = sourceBits(node);
  if (source) lines.push(source);
  const name = typeof node.community_name === 'string' ? node.community_name.trim() : '';
  if (name) lines.push(name);
  else if (key) lines.push('Community ' + key);
  return lines.join('\n\n');
}

function memberLine(node) {
  const label = clipTitle(typeof node.label === 'string' ? node.label : '').replace(/\s+/g, ' ');
  const source = sourceBits(node);
  return source ? '- ' + label + ' (' + source + ')' : '- ' + label;
}

function mapGraphify(data) {
  if (!isPlainObject(data.graph) || (data.graph.schema_version !== 1 && data.graph.schema_version !== '1')) return { error: COPY.badNode };
  if (Object.prototype.hasOwnProperty.call(data.graph, 'graphify_version') && data.graph.graphify_version != null && typeof data.graph.graphify_version !== 'string') {
    return { error: COPY.badNode };
  }
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) return { error: COPY.badNode };
  const links = graphifyEdgeList(data);
  if (!links) return { error: COPY.badNode };
  for (const node of data.nodes) {
    if (!validGraphifyNode(node)) return { error: COPY.badNode };
  }
  for (const link of links) {
    if (!isPlainObject(link) || typeof link.source !== 'string' || typeof link.target !== 'string') {
      return { error: COPY.badNode };
    }
  }
  const now = new Date().toISOString();
  if (data.nodes.length > 800) return mapCommunities(data.nodes, links, now);
  return mapSymbols(data.nodes, links, now);
}

function mapSymbols(rawNodes, links, now) {
  const nodes = [];
  const idMap = new Map();
  const seen = new Set();
  for (const raw of rawNodes) {
    if (!validGraphifyNode(raw)) return { error: COPY.badNode };
    const original = raw.id;
    if (seen.has(original)) return { error: COPY.badNode };
    seen.add(original);
    const id = uuidv5('graphify-node:' + original);
    idMap.set(original, id);
    const key = communityKey(raw.community);
    const fileType = typeof raw.file_type === 'string' ? raw.file_type.trim().toLowerCase() : '';
    const type = fileType === 'code' || isTrueFlag(raw._callable) ? 'snippet' : 'thought';
    const tags = normalizeTags([fileBasename(raw.source_file)]).filter((tag) => !FORBIDDEN_TAGS.has(tag));
    nodes.push({
      id,
      type,
      title: clipTitle(raw.label),
      body: symbolBody(raw, key),
      tags,
      createdAt: now,
      updatedAt: now
    });
  }
  const edges = [];
  const pairs = new Set();
  for (const link of links) {
    if (!isPlainObject(link)) return { error: COPY.badNode };
    pushPair(edges, pairs, idMap.get(link.source), idMap.get(link.target));
  }
  return { doc: { version: 1, initialized: true, connectBy: 'edges', nodes, edges } };
}

function mapCommunities(rawNodes, links, now) {
  const groups = new Map();
  const nodeCommunity = new Map();
  for (const raw of rawNodes) {
    if (!validGraphifyNode(raw)) return { error: COPY.badNode };
    const original = raw.id;
    if (nodeCommunity.has(original)) return { error: COPY.badNode };
    const key = communityKey(raw.community);
    nodeCommunity.set(original, key);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(raw);
  }
  const nodes = [];
  const communityUuid = new Map();
  for (const [key, members] of groups) {
    const id = uuidv5('graphify-community:' + key);
    communityUuid.set(key, id);
    const named = members.map((member) => (typeof member.community_name === 'string' ? member.community_name.trim() : '')).find(Boolean);
    const shown = members.slice(0, 40).map(memberLine);
    let body = shown.join('\n');
    if (members.length > 40) body += '\n\n\u2026and ' + (members.length - 40) + ' more';
    nodes.push({
      id,
      type: 'thought',
      title: clipTitle(named || ('Community ' + key).trim()),
      body,
      tags: [],
      createdAt: now,
      updatedAt: now
    });
  }
  const edges = [];
  const pairs = new Set();
  for (const link of links) {
    if (!isPlainObject(link)) return { error: COPY.badNode };
    const left = communityUuid.get(nodeCommunity.get(link.source));
    const right = communityUuid.get(nodeCommunity.get(link.target));
    pushPair(edges, pairs, left, right);
  }
  return { doc: { version: 1, initialized: true, connectBy: 'edges', nodes, edges } };
}

/* Graph */
function nodeColor(node) {
  if (node.type === 'task' && node.status === 'done') return '#75E7BA';
  return (TYPE[node.type] || TYPE.thought).color;
}

function vizKey(node) {
  const simple = state.doc.nodes.length > 400 ? 's' : 'd';
  return [node.type, node.status || '', nodeColor(node), simple].join('|');
}

function sphereGeo(radius, detail) {
  const key = radius + ':' + detail;
  if (!geoCache.has(key)) {
    const geometry = new THREE.SphereGeometry(radius, detail, Math.max(8, Math.round(detail * 0.7)));
    geometry.userData.shared = true;
    geoCache.set(key, geometry);
  }
  return geoCache.get(key);
}

function ringGeo(radius) {
  const key = 'ring:' + radius;
  if (!geoCache.has(key)) {
    const geometry = new THREE.RingGeometry(radius * 1.7, radius * 2.05, 48);
    geometry.userData.shared = true;
    geoCache.set(key, geometry);
  }
  return geoCache.get(key);
}

function iconChildren(icon) {
  if (Array.isArray(icon) && icon[0] === 'svg' && Array.isArray(icon[2])) return icon[2];
  if (Array.isArray(icon) && Array.isArray(icon[0])) return icon;
  return [];
}

function drawShape(ctx, tag, attrs) {
  if (tag === 'path' && attrs.d) {
    ctx.stroke(new Path2D(attrs.d));
    return;
  }
  if (tag === 'circle') {
    const r = Number(attrs.r || 0);
    ctx.beginPath();
    ctx.arc(Number(attrs.cx || 0), Number(attrs.cy || 0), r, 0, Math.PI * 2);
    if (r < 1) ctx.fill();
    else ctx.stroke();
    return;
  }
  if (tag === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(Number(attrs.cx || 0), Number(attrs.cy || 0), Number(attrs.rx || 0), Number(attrs.ry || 0), 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (tag === 'line') {
    ctx.beginPath();
    ctx.moveTo(Number(attrs.x1 || 0), Number(attrs.y1 || 0));
    ctx.lineTo(Number(attrs.x2 || 0), Number(attrs.y2 || 0));
    ctx.stroke();
    return;
  }
  if (tag === 'rect') {
    ctx.strokeRect(Number(attrs.x || 0), Number(attrs.y || 0), Number(attrs.width || 0), Number(attrs.height || 0));
    return;
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const nums = String(attrs.points || '').trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(nums[0], nums[1]);
    for (let i = 2; i < nums.length - 1; i += 2) ctx.lineTo(nums[i], nums[i + 1]);
    if (tag === 'polygon') ctx.closePath();
    ctx.stroke();
  }
}

function iconTexture(pascal) {
  const icons = window.lucide && window.lucide.icons;
  const children = iconChildren(icons && icons[pascal]);
  if (!children.length) return null;
  if (iconCache.has(pascal)) return iconCache.get(pascal);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#071321';
  ctx.fillStyle = '#071321';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(8, 8);
  ctx.scale(112 / 24, 112 / 24);
  for (const child of children) {
    if (!Array.isArray(child)) continue;
    try { drawShape(ctx, child[0], child[1] || {}); } catch (err) { /* skip a bad path */ }
  }
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.userData.shared = true;
  iconCache.set(pascal, texture);
  return texture;
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose();
    const materials = child.material ? [].concat(child.material) : [];
    materials.forEach((material) => {
      if (material.map && !material.map.userData.shared) material.map.dispose();
      material.dispose();
    });
  });
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
  group.userData.ring = null;
  group.userData.shells = [];
  group.userData.plate = null;
}

function addRing(group) {
  const ring = new THREE.Mesh(
    ringGeo(group.userData.radius || 4),
    new THREE.MeshBasicMaterial({
      color: 0xe7fbff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    })
  );
  ring.userData.role = 'ring';
  ring.userData.baseOpacity = 0.95;
  group.add(ring);
  group.userData.ring = ring;
}

function rebuildGroup(group, node) {
  clearGroup(group);
  const meta = TYPE[node.type] || TYPE.thought;
  const simple = state.doc.nodes.length > 400;
  const color = nodeColor(node);
  const radius = meta.radius;
  group.userData.radius = radius;
  const core = new THREE.Mesh(
    sphereGeo(radius, simple ? 10 : 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
  );
  core.userData.role = 'core';
  core.userData.baseOpacity = 1;
  core.userData.baseColor = color;
  group.add(core);
  if (!simple) {
    const halo = node.type === 'task' && node.status === 'done' ? 0.5 : 1;
    [[1.35, 0.12], [1.8, 0.035]].forEach(([scale, opacity]) => {
      const mesh = new THREE.Mesh(
        sphereGeo(radius * scale, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * halo, depthWrite: false })
      );
      mesh.userData.role = 'shell';
      mesh.userData.baseOpacity = opacity * halo;
      group.add(mesh);
      group.userData.shells.push(mesh);
    });
    const texture = iconTexture(meta.icon);
    if (texture) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false
      }));
      const glyph = radius * 1.25;
      sprite.scale.set(glyph, glyph, 1);
      sprite.center.set(0.5, 0.5);
      sprite.renderOrder = 2;
      sprite.userData.role = 'icon';
      sprite.userData.baseOpacity = 1;
      group.add(sprite);
    }
  }
  if (node.id === state.selectedId) addRing(group);
  syncNameplate(group, node);
}

function nodeThreeObject(node) {
  let group = objectMap.get(node.id);
  if (!group) {
    group = new THREE.Group();
    objectMap.set(node.id, group);
  }
  const key = vizKey(node);
  if (group.userData.key !== key) {
    rebuildGroup(group, node);
    group.userData.key = key;
  }
  return group;
}

function clipPlate(title, max) {
  const text = (title || '').trim() || COPY.untitled;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, Math.max(1, max - 1)).join('') + '\u2026';
}

function roundPlate(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function plateTexture(text, selected) {
  const key = (selected ? '1:' : '0:') + text;
  if (plateCache.has(key)) return plateCache.get(key);
  const scale = 2;
  const fontPx = 28 * scale;
  const font = '600 ' + fontPx + 'px "Space Grotesk", Inter, sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const textW = Math.ceil(probe.measureText(text).width);
  const padX = 18 * scale;
  const width = Math.max(64 * scale, textW + padX * 2);
  const height = 40 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  roundPlate(ctx, scale, scale, width - scale * 2, height - scale * 2, 16 * scale);
  ctx.fillStyle = selected ? 'rgba(7,19,33,0.88)' : 'rgba(7,19,33,0.82)';
  ctx.fill();
  ctx.lineWidth = (selected ? 3 : 1.5) * scale;
  ctx.strokeStyle = selected ? '#39E7FF' : 'rgba(57,231,255,0.55)';
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = '#E8F2FA';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.userData.shared = true;
  texture.userData.aspect = width / height;
  plateCache.set(key, texture);
  return texture;
}

function labelEveryNode() {
  if (isCoarse()) return true;
  return !canHoverFine();
}

function showNameplate(node) {
  const many = state.doc.nodes.length > 400;
  const selected = node.id === state.selectedId;
  const hit = state.query.trim().length > 0 && state.hitIds.has(node.id);
  if (many) return selected || hit;
  if (!labelEveryNode()) return selected;
  return true;
}

function syncNameplate(group, node) {
  const show = showNameplate(node);
  let sprite = group.userData.plate;
  if (!show) {
    if (sprite) sprite.visible = false;
    return;
  }
  const selected = node.id === state.selectedId;
  const text = clipPlate(node.title, selected ? 28 : 18);
  const texture = plateTexture(text, selected);
  if (!sprite) {
    sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false
    }));
    sprite.userData.role = 'plate';
    sprite.userData.baseOpacity = 1;
    sprite.center.set(0.5, 0.5);
    sprite.renderOrder = 3;
    group.add(sprite);
    group.userData.plate = sprite;
  } else if (sprite.material.map !== texture) {
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
  }
  const radius = group.userData.radius || 4;
  const worldH = selected ? 4.8 : 4;
  const worldW = worldH * (texture.userData.aspect || 4);
  sprite.scale.set(worldW, worldH, 1);
  sprite.position.set(0, -(radius + worldH * 0.62 + 0.7), 0);
  sprite.visible = true;
  sprite.renderOrder = selected ? 4 : 3;
  sprite.userData.baseOpacity = 1;
  sprite.userData.selected = selected;
  if (sprite.userData.dim == null) sprite.userData.dim = 1;
}

function syncAllNameplates() {
  state.doc.nodes.forEach((node) => {
    const group = objectMap.get(node.id);
    if (group) syncNameplate(group, node);
  });
}

function refreshPlateFont() {
  plateCache.forEach((texture) => texture.dispose());
  plateCache.clear();
  syncAllNameplates();
}

function refreshAppearance(node) {
  const group = objectMap.get(node.id);
  if (!group) return;
  const key = vizKey(node);
  if (group.userData.key !== key) {
    rebuildGroup(group, node);
    group.userData.key = key;
  }
  syncNameplate(group, node);
}

function setSelectedRing(id) {
  for (const [nodeId, group] of objectMap) {
    if (nodeId === id) {
      if (!group.userData.ring) addRing(group);
    } else if (group.userData.ring) {
      const ring = group.userData.ring;
      group.remove(ring);
      if (ring.material) ring.material.dispose();
      group.userData.ring = null;
    }
  }
  paintNodes();
}

function endpointId(value) {
  if (value && typeof value === 'object') return value.id;
  return value;
}

function tagLinks(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    node.tags.forEach((tag) => {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(node.id);
    });
  });
  const links = [];
  const seen = new Set();
  groups.forEach((ids) => {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) pushPair(links, seen, ids[i], ids[j]);
    }
  });
  return links;
}

function buildLinks(doc) {
  if (doc.connectBy === 'edges') {
    const ids = new Set(doc.nodes.map((node) => node.id));
    const links = [];
    const seen = new Set();
    (doc.edges || []).forEach((edge) => {
      if (ids.has(edge.source) && ids.has(edge.target)) pushPair(links, seen, edge.source, edge.target);
    });
    return links;
  }
  return tagLinks(doc.nodes);
}

function particlesFor(link) {
  if (state.reduced || state.doc.nodes.length > 400) return 0;
  if (state.query.trim() && link) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!state.hitIds.has(source) || !state.hitIds.has(target)) return 0;
  }
  return 1;
}

function paintLinks() {
  const graph = state.graph;
  if (!graph) return;
  const active = state.query.trim().length > 0;
  graph.linkColor((link) => {
    if (!active) return '#39E7FF';
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    return (!state.hitIds.has(source) || !state.hitIds.has(target)) ? 'rgba(57,231,255,0.15625)' : '#39E7FF';
  });
  graph.linkDirectionalParticles(particlesFor);
}

function paintNodes() {
  syncAllNameplates();
  const active = state.query.trim().length > 0;
  state.doc.nodes.forEach((node) => {
    const group = objectMap.get(node.id);
    if (!group) return;
    const dim = active && !state.hitIds.has(node.id);
    group.traverse((obj) => {
      if (!obj.material || obj.userData.baseOpacity == null) return;
      if (obj.userData.role === 'plate') {
        obj.userData.dim = dim ? 0.12 : 1;
        return;
      }
      obj.material.opacity = obj.userData.baseOpacity * (dim ? 0.12 : 1);
      obj.material.transparent = true;
      if (obj.userData.role === 'core') {
        const hover = state.hoverId === node.id;
        obj.scale.setScalar(hover ? 1.12 : 1);
        const color = new THREE.Color(obj.userData.baseColor);
        if (hover) color.lerp(new THREE.Color('#ffffff'), 0.35);
        obj.material.color.copy(color);
      }
    });
  });
}

function graphRecord(node) {
  let record = graphNodes.get(node.id);
  if (!record) {
    record = { id: node.id };
    const seed = layoutSeed.get(node.id);
    if (seed) {
      record.x = seed.x;
      record.y = seed.y;
      record.z = seed.z;
    }
    layoutSeed.delete(node.id);
    graphNodes.set(node.id, record);
  }
  record.type = node.type;
  record.title = node.title;
  record.body = node.body;
  record.tags = node.tags.slice();
  if (node.type === 'task') record.status = node.status === 'done' ? 'done' : 'open';
  else delete record.status;
  if (node.type === 'link' && node.url) record.url = node.url;
  else delete record.url;
  return record;
}

function syncGraph() {
  const graph = state.graph;
  if (!graph) return;
  const live = new Set(state.doc.nodes.map((node) => node.id));
  for (const id of [...graphNodes.keys()]) {
    if (!live.has(id)) graphNodes.delete(id);
  }
  graph.graphData({ nodes: state.doc.nodes.map(graphRecord), links: buildLinks(state.doc) });
  paintLinks();
  for (const [id, group] of objectMap) {
    if (!live.has(id)) {
      disposeObject(group);
      objectMap.delete(id);
    }
  }
  updateEmpty();
}

function isCompact() {
  return window.matchMedia('(max-width: 899px)').matches;
}

function syncChromeMetrics() {
  const bar = document.querySelector('.topbar');
  if (bar) {
    document.documentElement.style.setProperty('--topbar-bottom', Math.max(0, bar.getBoundingClientRect().bottom) + 'px');
  }
  document.body.classList.toggle('is-compact', isCompact());
}

function occupiedTop() {
  syncChromeMetrics();
  const bar = document.querySelector('.topbar');
  let top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
  if (document.body.classList.contains('is-sheet')) {
    const legend = document.querySelector('.legend');
    if (legend) top = Math.max(top, legend.getBoundingClientRect().bottom);
  }
  return top;
}

function syncSheetClass() {
  document.body.classList.toggle('is-sheet', state.hudOpen && isCompact());
}

function clearCameraOffset(camera) {
  if (camera.view && camera.view.enabled) camera.clearViewOffset();
}

function applyViewOffset(open) {
  const graph = state.graph;
  if (!graph) return;
  const camera = graph.camera();
  const fullW = Math.max(1, window.innerWidth);
  const fullH = Math.max(1, window.innerHeight);
  if (!open) {
    clearCameraOffset(camera);
    return;
  }
  if (isCompact()) {
    const top = occupiedTop();
    const sheet = Math.max(0, hud.getBoundingClientRect().height);
    const targetY = (top + (fullH - sheet)) / 2;
    const shiftY = Math.round(fullH / 2 - targetY);
    if (Math.abs(shiftY) <= 1) {
      clearCameraOffset(camera);
      return;
    }
    camera.setViewOffset(fullW, fullH, 0, shiftY, fullW, fullH);
    return;
  }
  const hudW = Math.min(432, Math.max(0, fullW - 32));
  const targetX = Math.max(0, fullW - 16 - hudW) / 2;
  const shiftX = Math.round(fullW / 2 - targetX);
  if (shiftX <= 1) {
    clearCameraOffset(camera);
    return;
  }
  camera.setViewOffset(fullW, fullH, shiftX, 0, fullW, fullH);
}

function focusNode(node, ms = state.reduced ? 0 : 600) {
  const graph = state.graph;
  const placed = node && graphNodes.get(node.id);
  const point = placed && Number.isFinite(placed.x) ? placed : node;
  if (!graph || !point || !Number.isFinite(point.x)) return;
  const dx = point.x || 0;
  const dy = point.y || 0;
  const dz = point.z || 0;
  const dist = Math.hypot(dx, dy, dz);
  const cam = dist < 0.001 ? { x: 0, y: 0, z: 180 } : {
    x: dx * ((dist + 170) / dist),
    y: dy * ((dist + 170) / dist),
    z: dz * ((dist + 170) / dist)
  };
  const look = dist < 0.001 ? { x: 0, y: 0, z: 0 } : { x: dx, y: dy, z: dz };
  graph.cameraPosition(cam, look, ms);
  applyViewOffset(Boolean(state.hudOpen));
}

function placeNode(node) {
  let x;
  let y;
  let z;
  if (!state.graph) {
    x = (Math.random() - 0.5) * 80;
    y = (Math.random() - 0.5) * 40;
    z = (Math.random() - 0.5) * 80;
  } else {
    const camera = state.graph.camera();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const pos = camera.position.clone().add(dir.multiplyScalar(150));
    x = pos.x + (Math.random() - 0.5) * 20;
    y = pos.y + (Math.random() - 0.5) * 20;
    z = pos.z + (Math.random() - 0.5) * 20;
  }
  layoutSeed.set(node.id, { x, y, z });
}

function showTooltip(node) {
  const current = getNode(node.id) || node;
  tipTitle.textContent = (current.title || '').trim() || COPY.untitled;
  if (current.type === 'task') {
    tipStatus.hidden = false;
    tipStatus.textContent = current.status === 'done' ? COPY.done : COPY.open;
  } else {
    tipStatus.hidden = true;
    tipStatus.textContent = '';
  }
  if (current.tags && current.tags.length) {
    tipTags.hidden = false;
    tipTags.textContent = current.tags.join(', ');
  } else {
    tipTags.hidden = true;
    tipTags.textContent = '';
  }
  tooltipEl.hidden = false;
  placeTooltip(state.pointer.x, state.pointer.y);
}

function placeTooltip(x, y) {
  const pad = 8;
  const rect = tooltipEl.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + rect.width > window.innerWidth - pad) left = x - rect.width - 14;
  if (top + rect.height > window.innerHeight - pad) top = y - rect.height - 14;
  left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
  top = Math.max(pad, Math.min(top, window.innerHeight - rect.height - pad));
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
}

function tick() {
  requestAnimationFrame(tick);
  const graph = state.graph;
  if (!graph) return;
  const camera = graph.camera();
  const now = performance.now();
  state.doc.nodes.forEach((node) => {
    const group = objectMap.get(node.id);
    if (!group) return;
    const ring = group.userData.ring;
    if (ring) {
      ring.quaternion.copy(camera.quaternion);
      if (!state.reduced && node.id === state.selectedId) {
        const t = (now % 1800) / 1800;
        ring.scale.setScalar(1 + 0.15 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2)));
      } else {
        ring.scale.setScalar(1);
      }
    }
    const plate = group.userData.plate;
    if (plate && plate.visible) {
      group.getWorldPosition(plateWorld);
      const dist = camera.position.distanceTo(plateWorld);
      let fade = 1;
      if (!plate.userData.selected) {
        const near = 160;
        const far = 520;
        if (dist >= far) fade = 0.08;
        else if (dist > near) fade = 1 - ((dist - near) / (far - near)) * 0.92;
      }
      const dim = plate.userData.dim == null ? 1 : plate.userData.dim;
      plate.material.opacity = fade * dim;
    }
    const shells = group.userData.shells || [];
    if (group.userData.pulseStart && !state.reduced) {
      const age = now - group.userData.pulseStart;
      if (age >= 600) {
        group.userData.pulseStart = 0;
        shells.forEach((shell) => shell.scale.setScalar(1));
      } else {
        const mag = 1 + (1 - age / 600) * 0.7;
        shells.forEach((shell) => shell.scale.setScalar(mag));
      }
    }
  });
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (err) {
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('load'));
    document.head.appendChild(script);
  });
}

/* Editor / preview */
function getNode(id) {
  return state.doc.nodes.find((node) => node.id === id) || null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ALLOWED = new Set(['P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'INPUT']);

function appendClean(parent, node) {
  const clean = cleanNode(node);
  if (!clean) return;
  parent.append(clean);
}

function cleanNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName;
  if (tag === 'IMG') return document.createTextNode(node.getAttribute('alt') || '');
  if (!ALLOWED.has(tag)) return document.createTextNode(node.textContent || '');
  if (tag === 'INPUT') {
    if ((node.getAttribute('type') || '').toLowerCase() !== 'checkbox') return document.createTextNode('');
    const input = document.createElement('input');
    input.setAttribute('type', 'checkbox');
    input.setAttribute('disabled', '');
    if (node.hasAttribute('checked')) input.setAttribute('checked', '');
    return input;
  }
  const el = document.createElement(tag.toLowerCase());
  if (tag === 'OL') {
    const start = node.getAttribute('start');
    if (start && /^\d+$/.test(start)) el.setAttribute('start', start);
  }
  if (tag === 'TD' || tag === 'TH') {
    ['colspan', 'rowspan'].forEach((name) => {
      const value = node.getAttribute(name);
      if (value && /^\d+$/.test(value)) el.setAttribute(name, value);
    });
  }
  for (const child of [...node.childNodes]) appendClean(el, child);
  return el;
}

function sanitizeMarkdownHtml(html) {
  const parsed = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + html + '</body></html>', 'text/html');
  const box = document.createElement('div');
  for (const child of [...parsed.body.childNodes]) appendClean(box, child);
  return box.innerHTML;
}

function configureMarked() {
  window.marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      html(token) {
        const raw = token && typeof token === 'object' ? (token.text || token.raw || '') : String(token || '');
        return escapeHtml(raw);
      },
      image(token) {
        const alt = token && typeof token === 'object' ? (token.text || '') : '';
        return escapeHtml(alt);
      },
      link(token) {
        let text = '';
        try { text = this.parser.parseInline(token.tokens || []); }
        catch (err) { text = escapeHtml((token && token.text) || ''); }
        if (!isHttpUrl(token && token.href)) return text;
        return '<a>' + text + '</a>';
      }
    }
  });
}

function renderPreviewNow() {
  const source = bodyEl.value;
  let inner = '<p class="empty">' + COPY.emptyPreview + '</p>';
  if (source.trim()) {
    try {
      const parsed = window.marked.parse(source);
      inner = sanitizeMarkdownHtml(typeof parsed === 'string' ? parsed : '');
    } catch (err) {
      inner = '<pre>' + escapeHtml(source) + '</pre>';
    }
    if (!inner.trim()) inner = '<p class="empty">' + COPY.emptyPreview + '</p>';
  }
  previewEl.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;">'
    + '<style>' + PREVIEW_CSS + '</style></head><body>' + inner + '</body></html>';
}

function schedulePreview() {
  window.clearTimeout(state.previewTimer);
  state.previewTimer = window.setTimeout(renderPreviewNow, 100);
}

function setBadge(type, status) {
  const meta = TYPE[type] || TYPE.thought;
  badgeEl.className = 'badge ' + meta.css;
  badgeEl.replaceChildren();
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', meta.dom);
  const label = document.createElement('span');
  label.textContent = meta.label;
  badgeEl.append(icon, label);
  badgeEl.style.color = type === 'task' && status === 'done' ? '#75E7BA' : meta.color;
  paintIcons();
}

function updateTypeUi() {
  const type = typeEl.value;
  statusRow.hidden = type !== 'task';
  urlRow.hidden = type !== 'link';
  setBadge(type, state.status);
  updateStatusUi();
}

function updateStatusUi() {
  statusOpen.setAttribute('aria-pressed', state.status === 'open' ? 'true' : 'false');
  statusDone.setAttribute('aria-pressed', state.status === 'done' ? 'true' : 'false');
}

function peeking() {
  return isCompact() && state.sheetMode === 'peek';
}

function renderChips() {
  const readonly = peeking();
  const stack = $('tags-stack');
  chipsEl.replaceChildren();
  state.tags.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (readonly ? ' is-readonly' : '');
    const label = document.createElement('span');
    label.textContent = tag;
    chip.append(label);
    if (!readonly) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn';
      const name = 'Remove tag ' + tag;
      button.title = name;
      button.setAttribute('aria-label', name);
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'x');
      button.append(icon);
      button.addEventListener('click', () => removeTag(tag));
      chip.append(button);
    }
    chipsEl.append(chip);
  });
  if (stack) stack.classList.toggle('is-empty', readonly && state.tags.length === 0);
  paintIcons();
}

function removeTag(tag) {
  state.tags = state.tags.filter((item) => item !== tag);
  renderChips();
  scheduleSave();
}

function commitTagBuffer(schedule) {
  const raw = tagInput.value;
  if (!raw.trim()) {
    tagInput.value = '';
    return;
  }
  const next = normalizeTags(state.tags.concat(raw.split(',')));
  tagInput.value = '';
  const same = next.length === state.tags.length && next.every((tag, index) => tag === state.tags[index]);
  if (same) return;
  state.tags = next;
  renderChips();
  if (schedule) scheduleSave();
}

function snapshot(node) {
  return JSON.stringify({
    type: node.type,
    title: node.title,
    body: node.body,
    tags: node.tags,
    status: node.status || null,
    url: node.url || null
  });
}

function readDraft() {
  return {
    title: titleEl.value,
    body: bodyEl.value,
    type: TYPES.has(typeEl.value) ? typeEl.value : 'thought',
    tags: state.tags.slice(),
    status: state.status === 'done' ? 'done' : 'open',
    url: urlEl.value.trim()
  };
}

function applyDraft(node, draft, announceUrl) {
  if (draft.title.length > 200) {
    toast(COPY.titleLong);
    draft.title = draft.title.slice(0, 200);
    titleEl.value = draft.title;
  }
  let urlInvalid = false;
  if (draft.type === 'link' && draft.url && !isHttpUrl(draft.url)) {
    urlInvalid = true;
    if (announceUrl && !state.urlWarned) {
      toast(COPY.badUrl);
      state.urlWarned = true;
    }
  } else {
    state.urlWarned = false;
  }
  const before = snapshot(node);
  node.type = draft.type;
  node.title = draft.title;
  node.body = draft.body;
  node.tags = draft.tags;
  if (draft.type === 'task') node.status = draft.status;
  else delete node.status;
  if (draft.type === 'link') {
    if (!urlInvalid && draft.url) node.url = draft.url;
    else if (!urlInvalid) delete node.url;
  } else {
    delete node.url;
  }
  const changed = before !== snapshot(node);
  if (changed) node.updatedAt = new Date().toISOString();
  return changed;
}

function flushSave(explicit) {
  window.clearTimeout(state.saveTimer);
  if (!state.hudOpen || !state.selectedId) return;
  const node = getNode(state.selectedId);
  if (!node) return;
  commitTagBuffer(false);
  const tagsBefore = node.tags.join('\u0000');
  const changed = applyDraft(node, readDraft(), true);
  if (changed) {
    refreshAppearance(node);
    if (state.doc.connectBy !== 'edges' && tagsBefore !== node.tags.join('\u0000')) syncGraph();
    if (state.query.trim()) runSearch();
    else paintNodes();
  }
  if (changed || explicit) {
    const ok = persist(state.doc);
    setSaveStatus(ok ? COPY.saved : COPY.saveFailed, !ok);
    if (!ok) toast(COPY.saveFailed);
    updateEmpty();
  } else {
    setSaveStatus(state.storageState === 'ok' ? COPY.saved : COPY.saveFailed, state.storageState !== 'ok');
  }
}

function scheduleSave() {
  setSaveStatus(COPY.saving, false);
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => flushSave(false), 300);
}

function renderPeek(node) {
  const title = $('peek-title');
  const status = $('peek-status');
  const url = $('peek-url');
  if (title) title.textContent = (node.title || '').trim() || COPY.untitled;
  if (status) {
    if (node.type === 'task') {
      status.hidden = false;
      status.textContent = node.status === 'done' ? COPY.done : COPY.open;
    } else {
      status.hidden = true;
      status.textContent = '';
    }
  }
  if (url) {
    if (node.type === 'link' && node.url) {
      url.hidden = false;
      url.textContent = node.url;
    } else {
      url.hidden = true;
      url.textContent = '';
    }
  }
}

function setEditorPanel(panel) {
  state.editorPanel = panel === 'preview' ? 'preview' : 'markdown';
  hud.dataset.panel = state.editorPanel;
  const markdown = $('tab-markdown');
  const preview = $('tab-preview');
  if (markdown) markdown.setAttribute('aria-selected', state.editorPanel === 'markdown' ? 'true' : 'false');
  if (preview) preview.setAttribute('aria-selected', state.editorPanel === 'preview' ? 'true' : 'false');
}

function setFormatting(on) {
  const toggle = $('format-toggle');
  hud.classList.toggle('is-formatting', Boolean(on));
  if (toggle) toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function applySheetMode(mode) {
  state.sheetMode = mode === 'peek' ? 'peek' : 'edit';
  if (isCompact()) hud.dataset.mode = state.sheetMode;
  else delete hud.dataset.mode;
  if (state.sheetMode !== 'edit') setFormatting(false);
  syncSheetClass();
}

function focusTitleFor(node) {
  if (state.sheetMode === 'peek' && isCompact()) {
    const active = document.activeElement;
    if (active && hud.contains(active) && typeof active.blur === 'function') active.blur();
    return;
  }
  const untitled = !String(node.title || '').trim() || node.title === COPY.untitled;
  if (isCompact() && !untitled) return;
  titleEl.focus();
  titleEl.scrollLeft = 0;
  if (node.title === COPY.untitled) titleEl.select();
}

function fillForm(node) {
  titleEl.value = node.title;
  titleEl.scrollLeft = 0;
  bodyEl.value = node.body;
  typeEl.value = node.type;
  state.tags = node.tags.slice();
  state.status = node.status === 'done' ? 'done' : 'open';
  urlEl.value = node.url || '';
  state.urlWarned = false;
  renderPeek(node);
  renderChips();
  updateTypeUi();
  setSaveStatus(state.storageState === 'ok' ? COPY.saved : COPY.saveFailed, state.storageState !== 'ok');
  renderPreviewNow();
  focusTitleFor(node);
}

function enterEdit() {
  const node = getNode(state.selectedId);
  if (!node) return;
  applySheetMode('edit');
  setEditorPanel('markdown');
  renderChips();
  focusTitleFor(node);
  applyViewOffset(true);
}

function moreIsOpen() {
  return Boolean(moreMenu && moreMenu.classList.contains('is-open'));
}

function setMoreOpen(open) {
  if (!moreBtn || !moreMenu) return;
  const show = Boolean(open) && isCompact();
  moreMenu.classList.toggle('is-open', show);
  moreBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
  moreMenu.querySelectorAll('button').forEach((button) => {
    if (show) button.setAttribute('role', 'menuitem');
    else button.removeAttribute('role');
  });
  if (show) moreMenu.setAttribute('role', 'menu');
  else moreMenu.removeAttribute('role');
}

function openHud() {
  state.hudOpen = true;
  hud.classList.add('is-open');
  hud.inert = false;
  hud.setAttribute('aria-hidden', 'false');
  setMoreOpen(false);
  syncSheetClass();
}

function closeHudQuiet() {
  state.hudOpen = false;
  hud.classList.remove('is-open');
  hud.inert = true;
  hud.setAttribute('aria-hidden', 'true');
  syncSheetClass();
  if (state.graph) clearCameraOffset(state.graph.camera());
}

function closeHud() {
  if (!state.hudOpen) return;
  flushSave(false);
  const trigger = state.hudTrigger;
  const node = getNode(state.selectedId);
  state.selectedId = null;
  setSelectedRing(null);
  closeHudQuiet();
  if (node) focusNode(node, state.reduced ? 0 : 200);
  state.hudTrigger = null;
  const visible = trigger && trigger.getClientRects && trigger.getClientRects().length > 0;
  if (visible && typeof trigger.focus === 'function') trigger.focus();
  else if ($('new-node')) $('new-node').focus();
}

function selectNode(id, trigger, pulse, options) {
  if (state.dialog) return;
  const forceEdit = Boolean(options && options.edit);
  const fromGraph = Boolean(options && options.fromGraph);
  const node = getNode(id);
  if (!node) return;
  const same = state.hudOpen && state.selectedId === id;
  if (state.hudOpen && state.selectedId) flushSave(false);
  state.selectedId = id;
  state.hudTrigger = trigger || document.activeElement;
  let mode = 'edit';
  if (isCompact() && !forceEdit) {
    if (same && fromGraph && state.sheetMode === 'peek') mode = 'edit';
    else if (same && state.sheetMode === 'edit') mode = 'edit';
    else mode = 'peek';
  }
  applySheetMode(mode);
  if (mode === 'edit') setEditorPanel('markdown');
  openHud();
  fillForm(node);
  setSelectedRing(id);
  if (!same) focusNode(node, state.reduced ? 0 : 600);
  else applyViewOffset(true);
  if (pulse && !state.reduced) {
    const group = objectMap.get(id);
    if (group) group.userData.pulseStart = performance.now();
  }
  setMoreOpen(false);
}

function createNode(trigger) {
  if (state.dialog) return;
  if (state.hudOpen) flushSave(false);
  const now = new Date().toISOString();
  const node = {
    id: newId(),
    type: 'thought',
    title: COPY.untitled,
    body: '',
    tags: [],
    createdAt: now,
    updatedAt: now
  };
  placeNode(node);
  state.doc.nodes.push(node);
  const ok = persist(state.doc);
  syncGraph();
  if (state.query.trim()) runSearch();
  selectNode(node.id, trigger || $('new-node'), true, { edit: true });
  if (!ok) {
    setSaveStatus(COPY.saveFailed, true);
    toast(COPY.saveFailed);
  }
  toast(COPY.created);
  updateEmpty();
}

function deleteSelected() {
  const id = state.selectedId;
  if (!id) return;
  window.clearTimeout(state.saveTimer);
  state.doc.nodes = state.doc.nodes.filter((node) => node.id !== id);
  if (state.doc.edges) state.doc.edges = state.doc.edges.filter((edge) => edge.source !== id && edge.target !== id);
  const group = objectMap.get(id);
  if (group) {
    disposeObject(group);
    objectMap.delete(id);
  }
  state.selectedId = null;
  closeHudQuiet();
  state.hudTrigger = null;
  const ok = persist(state.doc);
  syncGraph();
  if (state.query.trim()) runSearch();
  if (!ok) toast(COPY.saveFailed);
  toast(COPY.deleted);
  updateEmpty();
}

function resetNetwork() {
  window.clearTimeout(state.saveTimer);
  closeHudQuiet();
  state.selectedId = null;
  for (const group of objectMap.values()) disposeObject(group);
  objectMap.clear();
  state.doc = emptyDoc();
  clearSearch();
  const ok = persist(state.doc);
  syncGraph();
  updateEmpty();
  if (!ok) toast(COPY.saveFailed);
}

function updateEmpty() {
  emptyEl.hidden = !(state.doc.nodes.length === 0 && state.storageState !== 'corrupt');
}

function selectionRange() {
  return { start: bodyEl.selectionStart, end: bodyEl.selectionEnd };
}

function replaceRange(start, end, text) {
  bodyEl.focus();
  bodyEl.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }
  if (!ok) {
    bodyEl.setRangeText(text, start, end, 'end');
    bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function wrapSelection(before, after, fallback) {
  const range = selectionRange();
  const selected = bodyEl.value.slice(range.start, range.end);
  const inner = selected || fallback;
  replaceRange(range.start, range.end, before + inner + after);
}

function prefixLines(prefix, fallback) {
  const range = selectionRange();
  if (range.start === range.end) {
    replaceRange(range.start, range.end, prefix + fallback);
    return;
  }
  const value = bodyEl.value;
  const lineStart = value.lastIndexOf('\n', range.start - 1) + 1;
  let lineEnd = value.indexOf('\n', range.end);
  if (lineEnd < 0) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const next = block.split('\n').map((line) => prefix + line).join('\n');
  replaceRange(lineStart, lineEnd, next);
}

function format(kind) {
  if (isCompact()) setEditorPanel('markdown');
  if (kind === 'bold') wrapSelection('**', '**', 'text');
  else if (kind === 'italic') wrapSelection('*', '*', 'text');
  else if (kind === 'heading') prefixLines('## ', 'Heading');
  else if (kind === 'link') wrapSelection('[', '](https://)', 'Link text');
  else if (kind === 'list') prefixLines('- ', 'List item');
  else if (kind === 'quote') prefixLines('> ', 'Quote');
  else if (kind === 'code') {
    const range = selectionRange();
    const selected = bodyEl.value.slice(range.start, range.end);
    if (selected.includes('\n')) wrapSelection('```\n', '\n```', 'code');
    else wrapSelection('`', '`', 'code');
  }
  schedulePreview();
  scheduleSave();
}

/* Search */
function countLabel(count, singular, plural) {
  return count + ' ' + (count === 1 ? singular : plural);
}

function excerpt(body, query) {
  const plain = body.replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const at = plain.toLowerCase().indexOf(query);
  if (at < 0) return plain.slice(0, 90);
  const start = Math.max(0, at - 28);
  const end = Math.min(plain.length, at + query.length + 48);
  return (start > 0 ? '\u2026' : '') + plain.slice(start, end) + (end < plain.length ? '\u2026' : '');
}

function renderHits() {
  const count = state.hits.length;
  resultsCount.textContent = countLabel(count, 'result', 'results');
  resultsEmpty.hidden = count !== 0;
  resultsList.replaceChildren();
  state.hits.forEach((hit, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hit' + (index === state.activeHit ? ' is-active is-selected' : '');
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === state.activeHit ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'hit-title';
    title.textContent = hit.node.title.trim() || COPY.untitled;
    const tags = document.createElement('span');
    tags.className = 'hit-tags';
    tags.textContent = hit.node.tags.join(', ');
    const snip = document.createElement('span');
    snip.className = 'hit-excerpt';
    snip.textContent = excerpt(hit.node.body, state.query.trim().toLowerCase());
    button.append(title);
    if (hit.node.tags.length) button.append(tags);
    if (snip.textContent) button.append(snip);
    if (hit.inBody) {
      const note = document.createElement('span');
      note.className = 'hit-note';
      note.textContent = COPY.matchNote;
      button.append(note);
    }
    button.addEventListener('click', () => selectNode(hit.node.id, button, false));
    item.append(button);
    resultsList.append(item);
  });
  const active = resultsList.querySelector('.is-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function runSearch() {
  const query = state.query.trim().toLowerCase();
  clearBtn.hidden = state.query.length === 0;
  if (!query) {
    state.hits = [];
    state.hitIds = new Set();
    state.activeHit = -1;
    resultsEl.hidden = true;
    searchEl.setAttribute('aria-expanded', 'false');
    paintNodes();
    paintLinks();
    return;
  }
  const hits = [];
  state.doc.nodes.forEach((node) => {
    const inTitle = node.title.toLowerCase().includes(query);
    const inTags = node.tags.some((tag) => tag.includes(query));
    const inBody = node.body.toLowerCase().includes(query);
    if (inTitle || inTags || inBody) hits.push({ node, inBody });
  });
  state.hits = hits;
  state.hitIds = new Set(hits.map((hit) => hit.node.id));
  if (state.activeHit >= hits.length) state.activeHit = hits.length ? 0 : -1;
  if (state.activeHit < 0 && hits.length) state.activeHit = 0;
  resultsEl.hidden = false;
  searchEl.setAttribute('aria-expanded', 'true');
  renderHits();
  paintNodes();
  paintLinks();
}

function scheduleSearch() {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(runSearch, 80);
}

function clearSearch() {
  searchEl.value = '';
  state.query = '';
  setMoreOpen(false);
  runSearch();
}

function moveHit(step) {
  if (!state.hits.length) return;
  const next = state.activeHit < 0 ? 0 : (state.activeHit + step + state.hits.length) % state.hits.length;
  state.activeHit = next;
  renderHits();
}

/* Import / export */
function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportDoc() {
  if (state.hudOpen) flushSave(true);
  const date = new Date();
  const name = 'holocortex-'
    + date.getFullYear() + '-'
    + String(date.getMonth() + 1).padStart(2, '0') + '-'
    + String(date.getDate()).padStart(2, '0') + '.json';
  download(name, JSON.stringify(toDocument(state.doc), null, 2));
  toast(COPY.exported);
}

function looksGraphifyHead(head) {
  return /"graphify_version"\s*:/.test(head) && !/"version"\s*:\s*1\b/.test(head);
}

async function readImport(file) {
  if (state.dialog) return;
  try {
    if (file.size > GRAPHIFY_LIMIT) {
      const head = await file.slice(0, 512 * 1024).text();
      toast(looksGraphifyHead(head) ? COPY.tooLargeGraphify : COPY.tooLargeNative);
      return;
    }
    const text = await file.text();
    let data;
    try { data = parseJson(text); }
    catch (err) { toast(COPY.invalidJson); return; }
    const graphify = isGraphify(data);
    if (!graphify && file.size > NATIVE_LIMIT) {
      toast(COPY.tooLargeNative);
      return;
    }
    const mapped = graphify ? mapGraphify(data) : mapNative(data);
    if (mapped.error) {
      toast(mapped.error);
      return;
    }
    const check = mapNative(toDocument(mapped.doc));
    if (check.error) {
      toast(check.error);
      return;
    }
    state.pendingImport = check.doc;
    openDialog('import');
  } catch (err) {
    toast(COPY.invalidJson);
  }
}

function applyImport() {
  const doc = state.pendingImport;
  state.pendingImport = null;
  if (!doc) return;
  const ok = persist(doc);
  if (!ok) {
    toast(COPY.saveFailed);
    return;
  }
  window.clearTimeout(state.saveTimer);
  closeHudQuiet();
  state.selectedId = null;
  for (const group of objectMap.values()) disposeObject(group);
  objectMap.clear();
  state.doc = doc;
  clearSearch();
  syncGraph();
  updateEmpty();
  toast('Imported ' + countLabel(doc.nodes.length, 'node', 'nodes'));
}

function openDialog(kind) {
  const copy = DIALOGS[kind];
  state.dialog = kind;
  state.dialogTrigger = document.activeElement;
  dlgTitle.textContent = copy.title;
  dlgText.textContent = copy.text;
  if (kind === 'import' && state.pendingImport) {
    dlgCount.hidden = false;
    dlgCount.textContent = countLabel(state.pendingImport.nodes.length, 'node', 'nodes');
  } else {
    dlgCount.hidden = true;
    dlgCount.textContent = '';
  }
  dlgOk.textContent = copy.ok;
  dlgOk.classList.toggle('is-danger', kind !== 'import');
  dialogRoot.hidden = false;
  dlgCancel.focus();
}

function closeDialog(confirmed) {
  const kind = state.dialog;
  if (!kind) return;
  dialogRoot.hidden = true;
  state.dialog = null;
  const trigger = state.dialogTrigger;
  state.dialogTrigger = null;
  if (!confirmed) state.pendingImport = null;
  if (confirmed && kind === 'delete') deleteSelected();
  else if (confirmed && kind === 'reset') resetNetwork();
  else if (confirmed && kind === 'import') applyImport();
  if (!confirmed && trigger && typeof trigger.focus === 'function') trigger.focus();
  else if (confirmed) $('new-node').focus();
}

function typingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    if (state.dialog) {
      event.preventDefault();
      closeDialog(false);
      return;
    }
    if (state.hudOpen) {
      event.preventDefault();
      closeHud();
      return;
    }
    if (moreIsOpen()) {
      event.preventDefault();
      setMoreOpen(false);
      return;
    }
    if (state.query || !resultsEl.hidden) {
      event.preventDefault();
      clearSearch();
    }
    return;
  }
  if (state.dialog && event.key === 'Tab') {
    const first = dlgCancel;
    const last = dlgOk;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if (state.dialog) return;
  const meta = event.metaKey || event.ctrlKey;
  if (meta && (event.key === 'k' || event.key === 'K')) {
    event.preventDefault();
    searchEl.focus();
    searchEl.select();
    return;
  }
  if (event.key === '/' && !typingTarget(event.target)) {
    event.preventDefault();
    searchEl.focus();
    return;
  }
  if (meta && (event.key === 'n' || event.key === 'N')) {
    event.preventDefault();
    createNode($('new-node'));
    return;
  }
  if (meta && (event.key === 's' || event.key === 'S')) {
    event.preventDefault();
    if (state.hudOpen) flushSave(true);
    return;
  }
  if (document.activeElement === searchEl && !resultsEl.hidden) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHit(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHit(-1);
    } else if (event.key === 'Enter' && state.hits.length) {
      event.preventDefault();
      const hit = state.hits[Math.max(0, state.activeHit)];
      const button = resultsList.querySelector('.is-active') || resultsList.querySelector('button');
      if (hit) selectNode(hit.node.id, button || searchEl, false);
    }
  }
}

function scanPlayed() {
  try { return localStorage.getItem(SCAN_KEY) === '1' || state.scanMemory; }
  catch (err) { return state.scanMemory; }
}

function markScan() {
  state.scanMemory = true;
  try { localStorage.setItem(SCAN_KEY, '1'); } catch (err) { /* keep the in-memory mark */ }
}

function maybeSweep() {
  if (state.reduced || scanPlayed()) return;
  markScan();
  const sweep = $('sweep');
  sweep.hidden = false;
  sweep.addEventListener('animationend', () => { sweep.hidden = true; }, { once: true });
}

function bindUi() {
  if (moreBtn) {
    moreBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      setMoreOpen(!moreIsOpen());
    });
  }
  if (moreMenu) {
    moreMenu.addEventListener('click', () => setMoreOpen(false));
  }
  document.addEventListener('pointerdown', (event) => {
    if (!moreIsOpen()) return;
    const target = event.target;
    if ((moreMenu && moreMenu.contains(target)) || (moreBtn && moreBtn.contains(target))) return;
    setMoreOpen(false);
  });
  graphEl.addEventListener('touchmove', (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  $('new-node').addEventListener('click', () => createNode($('new-node')));
  $('empty-new').addEventListener('click', () => createNode($('empty-new')));
  $('close-hud').addEventListener('click', closeHud);
  $('peek-edit').addEventListener('click', enterEdit);
  $('save-btn').addEventListener('click', () => flushSave(true));
  $('format-toggle').addEventListener('click', () => {
    const toggle = $('format-toggle');
    setFormatting(toggle.getAttribute('aria-pressed') !== 'true');
  });
  $('tab-markdown').addEventListener('click', () => setEditorPanel('markdown'));
  $('tab-preview').addEventListener('click', () => {
    setEditorPanel('preview');
    renderPreviewNow();
  });
  bodyEl.addEventListener('focus', () => hud.classList.add('is-body-focus'));
  bodyEl.addEventListener('blur', () => hud.classList.remove('is-body-focus'));
  titleEl.addEventListener('focus', () => {
    const pin = () => { titleEl.scrollLeft = 0; };
    pin();
    window.requestAnimationFrame(pin);
  });
  $('delete-btn').addEventListener('click', () => openDialog('delete'));
  $('reset-btn').addEventListener('click', () => openDialog('reset'));
  $('import-btn').addEventListener('click', () => fileEl.click());
  $('export-btn').addEventListener('click', exportDoc);
  $('open-link').addEventListener('click', () => {
    const url = urlEl.value.trim();
    if (!isHttpUrl(url)) {
      toast(COPY.badUrl);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  fileEl.addEventListener('change', () => {
    const file = fileEl.files && fileEl.files[0];
    fileEl.value = '';
    if (file) readImport(file);
  });
  dlgCancel.addEventListener('click', () => closeDialog(false));
  dlgOk.addEventListener('click', () => closeDialog(true));
  clearBtn.addEventListener('click', () => {
    clearSearch();
    searchEl.focus();
  });
  searchEl.addEventListener('focus', () => setMoreOpen(false));
  searchEl.addEventListener('input', () => {
    state.query = searchEl.value;
    state.activeHit = 0;
    clearBtn.hidden = state.query.length === 0;
    scheduleSearch();
  });
  titleEl.addEventListener('input', scheduleSave);
  bodyEl.addEventListener('input', () => {
    schedulePreview();
    scheduleSave();
  });
  urlEl.addEventListener('input', scheduleSave);
  titleEl.addEventListener('blur', () => flushSave(false));
  bodyEl.addEventListener('blur', () => flushSave(false));
  urlEl.addEventListener('blur', () => flushSave(false));
  tagInput.addEventListener('input', () => {
    if (tagInput.value.includes(',')) commitTagBuffer(false);
    scheduleSave();
  });
  tagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTagBuffer(true);
    } else if (event.key === 'Backspace' && tagInput.value === '' && state.tags.length) {
      removeTag(state.tags[state.tags.length - 1]);
    }
  });
  tagInput.addEventListener('blur', () => {
    commitTagBuffer(false);
    flushSave(false);
  });
  typeEl.addEventListener('change', () => {
    if (typeEl.value === 'task' && state.status !== 'done') state.status = 'open';
    updateTypeUi();
    scheduleSave();
  });
  statusOpen.addEventListener('click', () => {
    state.status = 'open';
    updateTypeUi();
    scheduleSave();
  });
  statusDone.addEventListener('click', () => {
    state.status = 'done';
    updateTypeUi();
    scheduleSave();
  });
  $('format-bar').addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) event.preventDefault();
  });
  $('format-bar').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    format(button.getAttribute('data-format'));
  });
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointermove', (event) => {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    if (!tooltipEl.hidden) placeTooltip(event.clientX, event.clientY);
  });
  window.addEventListener('pagehide', () => flushSave(false));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', () => {
    state.reduced = motion.matches;
    paintLinks();
  });
  const onPointerMode = () => {
    if (!canHoverFine() || isCoarse()) {
      state.hoverId = null;
      tooltipEl.hidden = true;
    }
    syncAllNameplates();
    paintNodes();
  };
  hoverFineQuery.addEventListener('change', onPointerMode);
  coarseQuery.addEventListener('change', onPointerMode);
  const observer = new ResizeObserver(() => {
    const graph = state.graph;
    if (state.hudOpen && !isCompact()) delete hud.dataset.mode;
    else if (state.hudOpen && isCompact()) hud.dataset.mode = state.sheetMode || 'edit';
    syncSheetClass();
    syncChromeMetrics();
    if (!graph) return;
    graph.width(window.innerWidth);
    graph.height(window.innerHeight);
    graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    if (state.hudOpen && state.selectedId) focusNode(getNode(state.selectedId), 0);
    else applyViewOffset(false);
  });
  observer.observe(document.documentElement);
  const hudObserver = new ResizeObserver(() => {
    syncChromeMetrics();
    if (state.hudOpen) applyViewOffset(true);
  });
  hudObserver.observe(hud);
}

/* Bootstrap */
async function boot() {
  if (window.__hcDepFailed || !window.marked || !window.lucide || !window.tailwind) {
    showBanner(COPY.deps);
    loadingEl.hidden = true;
    return;
  }
  configureMarked();
  paintIcons();
  bindUi();
  if (!hasWebGL()) {
    showBanner(COPY.webgl);
    loadingEl.hidden = true;
    updateEmpty();
    return;
  }
  await loadScript('https://cdn.jsdelivr.net/npm/3d-force-graph@1.77.0/dist/3d-force-graph.js');
  if (typeof window.ForceGraph3D !== 'function') {
    showBanner(COPY.deps);
    loadingEl.hidden = true;
    return;
  }
  loadDocument();
  let graph;
  try {
    graph = window.ForceGraph3D()(graphEl)
      .backgroundColor('#030712')
      .showNavInfo(false)
      .enableNodeDrag(false)
      .nodeLabel(() => '')
      .linkLabel(() => '')
      .nodeThreeObject(nodeThreeObject)
      .nodeThreeObjectExtend(false)
      .linkOpacity(0.16)
      .linkWidth(0.35)
      .linkDirectionalParticles(state.reduced || state.doc.nodes.length > 400 ? 0 : 1)
      .linkDirectionalParticleSpeed(0.002)
      .linkDirectionalParticleWidth(0.65)
      .warmupTicks(60)
      .cooldownTicks(120)
      .onNodeClick((node) => { if (node) selectNode(node.id, graphEl, false, { fromGraph: true }); })
      .onBackgroundClick(() => {
        setMoreOpen(false);
        if (state.hudOpen) closeHud();
      })
      .onNodeHover((node) => {
        if (!canHoverFine() || isCoarse()) {
          state.hoverId = null;
          tooltipEl.hidden = true;
          return;
        }
        state.hoverId = node ? node.id : null;
        if (!node) tooltipEl.hidden = true;
        else showTooltip(node);
        paintNodes();
      });
  } catch (err) {
    showBanner(COPY.webgl);
    loadingEl.hidden = true;
    return;
  }
  state.graph = graph;
  graph.width(window.innerWidth);
  graph.height(window.innerHeight);
  graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const controls = graph.controls();
  if (controls) {
    controls.autoRotate = false;
    if (THREE.TOUCH) {
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    }
  }
  const canvas = graph.renderer().domElement;
  if (canvas) canvas.style.touchAction = 'none';
  syncGraph();
  graph.cameraPosition({ x: 0, y: 36, z: 230 });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.graph) refreshPlateFont();
    });
  }
  loadingEl.hidden = true;
  updateEmpty();
  maybeSweep();
  renderPreviewNow();
  tick();
  window.__HC_BOOTED = true;
}

boot().catch(() => {
  showBanner(COPY.deps);
  loadingEl.hidden = true;
});
