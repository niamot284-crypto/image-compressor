import * as pdfjsLib from './lib/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';

const $ = selector => document.querySelector(selector);
const pdfInput = $('#pdf-input');
const imageInput = $('#image-input');
const dropZone = $('#pdf-drop-zone');
const openPanel = $('#open-panel');
const workspace = $('#workspace');
const pagesHost = $('#pages');
const openMessage = $('#open-message');
const status = $('#editor-status');
const toolName = $('#tool-name');
const toolHelp = $('#tool-help');
const selectedImageName = $('#selected-image-name');
const undoButton = $('#undo-button');
const redoButton = $('#redo-button');
const deleteButton = $('#delete-item');
const downloadButton = $('#download-pdf');
const tools = [...document.querySelectorAll('[data-tool]')];

const { PDFDocument, rgb, degrees } = window.PDFLib;
const HELP = {
  select: ['নির্বাচন', 'আইটেমে ট্যাপ বা ক্লিক করুন। টেনে সরান, কোণের হ্যান্ডল দিয়ে আকার বদলান।'],
  'edit-text': ['লেখা বদল', 'চিহ্নিত লেখা-লাইনে ট্যাপ করুন, তারপর সাদা জায়গায় নতুন লেখা টাইপ করুন।'],
  'add-text': ['লেখা যোগ', 'পেজে ট্যাপ করে নতুন লেখার ঘর বসান।'],
  'replace-image': ['ছবি বদল', 'আগে “ছবি বাছুন” চাপুন, তারপর পুরোনো ছবির ওপর টেনে একটি জায়গা নির্বাচন করুন।'],
  'add-image': ['ছবি যোগ', 'আগে “ছবি বাছুন” চাপুন, তারপর পেজে টেনে ছবির জায়গা ঠিক করুন।'],
  draw: ['আঁকুন', 'পেজে টেনে ফ্রি-হ্যান্ড আঁকুন।'], rectangle: ['বক্স', 'পেজে টেনে একটি বক্স আঁকুন।'],
  line: ['লাইন', 'পেজে টেনে একটি লাইন আঁকুন।'], arrow: ['তীর', 'পেজে টেনে একটি তীর আঁকুন।'],
  highlight: ['হাইলাইট', 'পেজে টেনে লেখার ওপর হলুদ দাগ দিন।'], whiteout: ['ঢাকুন', 'পেজে টেনে কোনো অংশ আড়াল করুন।'],
  signature: ['স্বাক্ষর', 'পেজে নিজের স্বাক্ষর আঁকুন।']
};
const state = { source: null, sourceBytes: null, pages: [], tool: 'select', selectedId: null, pendingImage: null, undo: [], redo: [], nextId: 1, busy: false };
let rendering = false;
let renderAgain = false;

function id() { return `item-${state.nextId++}`; }
function setMessage(text = '', isError = false) { status.textContent = text; status.classList.toggle('ok', !isError && Boolean(text)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function activePages() { return state.pages.filter(page => !page.deleted); }
function combinedRotation(page) { return ((page.initialRotation || 0) + page.rotation) % 360; }
function viewSize(page) { return combinedRotation(page) % 180 ? { width: page.baseHeight, height: page.baseWidth } : { width: page.baseWidth, height: page.baseHeight }; }
function number(value) { return Math.max(0, Number.isFinite(value) ? value : 0); }
function bounds(annotation) {
  if (annotation.kind === 'line' || annotation.kind === 'arrow') return { x: Math.min(annotation.x1, annotation.x2), y: Math.min(annotation.y1, annotation.y2), w: Math.max(6, Math.abs(annotation.x2 - annotation.x1)), h: Math.max(6, Math.abs(annotation.y2 - annotation.y1)) };
  if (annotation.kind === 'stroke') {
    const xs = annotation.points.map(point => point.x); const ys = annotation.points.map(point => point.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(6, Math.max(...xs) - Math.min(...xs)), h: Math.max(6, Math.max(...ys) - Math.min(...ys)) };
  }
  return { x: annotation.x, y: annotation.y, w: Math.max(6, annotation.w), h: Math.max(6, annotation.h) };
}
function snapshot() { state.undo.push(JSON.stringify({ pages: state.pages, selectedId: state.selectedId, nextId: state.nextId })); if (state.undo.length > 35) state.undo.shift(); state.redo = []; updateButtons(); }
function restore(serialized) { const restored = JSON.parse(serialized); state.pages = restored.pages; state.selectedId = restored.selectedId; state.nextId = restored.nextId; renderAll(); updateButtons(); }
function undo() { if (!state.undo.length) return; state.redo.push(JSON.stringify({ pages: state.pages, selectedId: state.selectedId, nextId: state.nextId })); restore(state.undo.pop()); }
function redo() { if (!state.redo.length) return; state.undo.push(JSON.stringify({ pages: state.pages, selectedId: state.selectedId, nextId: state.nextId })); restore(state.redo.pop()); }
function updateButtons() { undoButton.disabled = !state.undo.length || state.busy; redoButton.disabled = !state.redo.length || state.busy; deleteButton.disabled = !state.selectedId || state.busy; downloadButton.disabled = state.busy || !activePages().length; }
function setTool(tool) { state.tool = tool; state.selectedId = null; tools.forEach(button => button.classList.toggle('active', button.dataset.tool === tool)); const [name, help] = HELP[tool]; toolName.textContent = name; toolHelp.textContent = help; setMessage(); renderAll(); updateButtons(); }
function getPageState(key) { return state.pages.find(page => page.key === key); }
function annotationById(itemId) { for (const page of state.pages) { const item = page.items.find(candidate => candidate.id === itemId); if (item) return { page, item }; } return null; }
function selectedAnnotation() { return state.selectedId ? annotationById(state.selectedId) : null; }
function cssRect(annotation, scale) { const box = bounds(annotation); return { left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }; }
function clientToPage(event, sheet, page) { const rect = sheet.getBoundingClientRect(); const size = viewSize(page); return { x: Math.min(size.width, Math.max(0, (event.clientX - rect.left) * size.width / rect.width)), y: Math.min(size.height, Math.max(0, (event.clientY - rect.top) * size.height / rect.height)) }; }
function cssColor(color) { const hex = (color || '#ffffff').replace('#', ''); const parsed = Number.parseInt(hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex, 16); return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255); }
function sampleBackground(canvas, x, y, width, height, page) { try { const scaleX = canvas.width / viewSize(page).width; const scaleY = canvas.height / viewSize(page).height; const px = Math.max(0, Math.min(canvas.width - 1, Math.round((x + width / 2) * scaleX))); const py = Math.max(0, Math.min(canvas.height - 1, Math.round((y + height / 2) * scaleY))); const pixels = canvas.getContext('2d').getImageData(px, py, 1, 1).data; return `#${[pixels[0], pixels[1], pixels[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`; } catch { return '#ffffff'; }
}

async function openPdf(file) {
  if (!file || (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) { openMessage.textContent = 'একটি PDF ফাইল নির্বাচন করুন।'; return; }
  try {
    openMessage.textContent = 'PDF খোলা হচ্ছে…';
    const bytes = new Uint8Array(await file.arrayBuffer());
    const source = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    state.source = source; state.sourceBytes = bytes; state.pages = []; state.undo = []; state.redo = []; state.nextId = 1; state.selectedId = null;
    for (let index = 0; index < source.numPages; index++) {
      const pdfPage = await source.getPage(index + 1); const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
      state.pages.push({ key: `source-${index}`, originalIndex: index, blank: false, deleted: false, initialRotation: pdfPage.rotate || 0, rotation: 0, baseWidth: viewport.width, baseHeight: viewport.height, items: [] });
    }
    openPanel.hidden = true; workspace.hidden = false; openMessage.textContent = ''; setMessage(`${state.pages.length}টি পেজ প্রস্তুত। একটি টুল বেছে সম্পাদনা শুরু করুন।`); renderAll(); updateButtons();
  } catch (error) { openMessage.textContent = 'PDF খোলা যায়নি। ফাইলটি ক্ষতিগ্রস্ত বা পাসওয়ার্ড-সুরক্ষিত হতে পারে।'; }
}

async function renderAll() {
  if (!state.source || workspace.hidden) return;
  if (rendering) { renderAgain = true; return; }
  rendering = true;
  try {
    do {
      renderAgain = false;
      const scrollTop = pagesHost.scrollTop; pagesHost.replaceChildren();
      for (const [index, page] of activePages().entries()) await renderPage(page, index + 1);
      pagesHost.scrollTop = scrollTop;
    } while (renderAgain);
  } finally { rendering = false; }
}

async function renderPage(page, pageNumber) {
  const size = viewSize(page); const sheet = document.createElement('article'); sheet.className = 'page-sheet'; sheet.dataset.pageKey = page.key;
  const displayWidth = Math.min(800, Math.max(250, size.width)); const scale = displayWidth / size.width; const displayHeight = size.height * scale;
  sheet.style.width = `${displayWidth}px`; sheet.style.height = `${displayHeight}px`;
  const canvas = document.createElement('canvas'); canvas.className = 'page-canvas'; canvas.width = Math.round(displayWidth * Math.min(2, devicePixelRatio || 1)); canvas.height = Math.round(displayHeight * Math.min(2, devicePixelRatio || 1)); canvas.style.width = `${displayWidth}px`; canvas.style.height = `${displayHeight}px`;
  if (page.blank) { const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  else {
    const pdfPage = await state.source.getPage(page.originalIndex + 1); const renderScale = canvas.width / size.width; const viewport = pdfPage.getViewport({ scale: renderScale, rotation: combinedRotation(page) });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); canvas.style.width = `${displayWidth}px`; canvas.style.height = `${displayHeight}px`; await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  const overlay = document.createElement('div'); overlay.className = 'page-overlay';
  const actions = document.createElement('div'); actions.className = 'page-actions';
  actions.innerHTML = `<button type="button" data-page-action="rotate" title="পেজ ঘোরান">↻</button><button type="button" class="delete-page" data-page-action="delete" title="পেজ বাদ দিন">×</button>`;
  actions.addEventListener('click', event => pageAction(event, page));
  const label = document.createElement('span'); label.className = 'page-label'; label.textContent = `পৃষ্ঠা ${pageNumber}`;
  sheet.append(canvas, overlay, actions, label); pagesHost.append(sheet); renderPageOverlay(page, overlay, canvas, scale); bindPagePointer(page, sheet, overlay, canvas, scale);
}

async function renderPageOverlay(page, overlay, canvas, scale) {
  if (state.tool === 'edit-text' && !page.blank) {
    try {
      const pdfPage = await state.source.getPage(page.originalIndex + 1); const viewport = pdfPage.getViewport({ scale: 1, rotation: combinedRotation(page) }); const text = await pdfPage.getTextContent();
      for (const item of text.items) {
        if (!item.str || !item.str.trim()) continue;
        const transform = pdfjsLib.Util.transform(viewport.transform, item.transform); const fontSize = Math.max(8, Math.hypot(transform[2], transform[3])); const width = Math.max(12, Math.abs(item.width));
        const hot = document.createElement('button'); hot.type = 'button'; hot.className = 'text-hotspot'; hot.style.left = `${transform[4] * scale}px`; hot.style.top = `${(transform[5] - fontSize) * scale}px`; hot.style.width = `${width * scale}px`; hot.style.height = `${Math.max(fontSize * 1.25, 11) * scale}px`; hot.title = item.str; hot.setAttribute('aria-label', `লেখা বদলান: ${item.str}`);
        hot.addEventListener('click', event => { event.stopPropagation(); snapshot(); const x = transform[4]; const y = transform[5] - fontSize; const h = Math.max(fontSize * 1.25, 11); page.items.push({ id: id(), kind: 'text', x, y, w: Math.max(width, fontSize * 2), h, fontSize, text: '', color: '#19382e', bg: sampleBackground(canvas, x, y, width, h, page), replace: true }); state.selectedId = page.items.at(-1).id; setTool('select'); }); overlay.append(hot);
      }
    } catch { setMessage('এই পেজের লেখা শনাক্ত করা যায়নি।', true); }
  }
  for (const item of page.items) overlay.append(createItemElement(page, item, scale));
}

function createItemElement(page, item, scale) {
  const element = document.createElement('div'); element.className = `annotation ${item.kind}${state.selectedId === item.id ? ' selected' : ''}`; element.dataset.itemId = item.id;
  const rect = cssRect(item, scale); Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  if (item.kind === 'text') { element.style.setProperty('--item-bg', item.bg); const input = document.createElement('input'); input.name = 'editable-text'; input.value = item.text; input.setAttribute('aria-label', 'নতুন লেখা'); input.style.fontSize = `${Math.max(8, item.fontSize * scale)}px`; input.addEventListener('input', () => { item.text = input.value; }); input.addEventListener('focus', () => { state.selectedId = item.id; updateButtons(); }); element.append(input); }
  else if (item.kind === 'image') { const image = document.createElement('img'); image.src = item.data; image.alt = ''; element.append(image); }
  else if (item.kind === 'whiteout') element.style.setProperty('--item-bg', item.bg || '#ffffff');
  else if (item.kind === 'line' || item.kind === 'arrow' || item.kind === 'stroke') { element.classList.add('vector'); const box = bounds(item); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); if (item.kind === 'stroke') { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', item.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')); path.setAttribute('fill', 'none'); path.setAttribute('stroke', item.signature ? '#19382e' : '#146c52'); path.setAttribute('stroke-width', String(item.thickness || 2.5)); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path); } else { const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('x1', String(item.x1)); line.setAttribute('y1', String(item.y1)); line.setAttribute('x2', String(item.x2)); line.setAttribute('y2', String(item.y2)); line.setAttribute('stroke', '#146c52'); line.setAttribute('stroke-width', '2'); if (item.kind === 'arrow') { line.setAttribute('marker-end', 'url(#arrow-head)'); const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); defs.innerHTML = '<marker id="arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#146c52"/></marker>'; svg.append(defs); } svg.append(line); } element.append(svg); }
  if (state.selectedId === item.id && item.kind !== 'stroke') { const handle = document.createElement('span'); handle.className = 'handle'; handle.dataset.handle = 'resize'; element.append(handle); }
  element.addEventListener('pointerdown', event => beginItemInteraction(event, page, item, element, scale));
  return element;
}

function beginItemInteraction(event, page, item, element, scale) {
  if (event.target.tagName === 'INPUT') return; event.stopPropagation();
  if (state.tool !== 'select') return;
  const resize = event.target.dataset.handle === 'resize'; snapshot(); state.selectedId = item.id; updateButtons(); const sheet = element.closest('.page-sheet'); const start = clientToPage(event, sheet, page); const original = clone(item); try { element.setPointerCapture(event.pointerId); } catch { /* Pointer capture is unavailable for synthetic events. */ }
  const move = moveEvent => { const point = clientToPage(moveEvent, sheet, page); const dx = point.x - start.x; const dy = point.y - start.y; if (resize) resizeItem(item, original, dx, dy); else moveItem(item, original, dx, dy); };
  const finish = finishEvent => { if (finishEvent) move(finishEvent); element.removeEventListener('pointermove', move); renderAll(); };
  element.addEventListener('pointermove', move); element.addEventListener('pointerup', finish, { once: true }); element.addEventListener('pointercancel', finish, { once: true });
}
function moveItem(item, original, dx, dy) { if (item.kind === 'line' || item.kind === 'arrow') { item.x1 = original.x1 + dx; item.x2 = original.x2 + dx; item.y1 = original.y1 + dy; item.y2 = original.y2 + dy; } else if (item.kind === 'stroke') item.points = original.points.map(point => ({ x: point.x + dx, y: point.y + dy })); else { item.x = original.x + dx; item.y = original.y + dy; } }
function resizeItem(item, original, dx, dy) { if (item.kind === 'line' || item.kind === 'arrow') { item.x2 = original.x2 + dx; item.y2 = original.y2 + dy; } else { item.w = Math.max(12, original.w + dx); item.h = Math.max(12, original.h + dy); } }

function bindPagePointer(page, sheet, overlay, canvas, scale) {
  overlay.addEventListener('pointerdown', event => {
    if (event.target !== overlay) return; const start = clientToPage(event, sheet, page);
    if (state.tool === 'select') { state.selectedId = null; updateButtons(); renderAll(); return; }
    if (state.tool === 'edit-text') return;
    if ((state.tool === 'add-image' || state.tool === 'replace-image') && !state.pendingImage) { setMessage('আগে “ছবি বাছুন” থেকে একটি ছবি নির্বাচন করুন।', true); return; }
    snapshot(); const item = createNewItem(page, start, canvas); if (!item) return; page.items.push(item); state.selectedId = item.id; try { overlay.setPointerCapture(event.pointerId); } catch { /* Pointer capture is unavailable for synthetic events. */ }
    const move = moveEvent => { const point = clientToPage(moveEvent, sheet, page); updateNewItem(item, start, point); };
    const finish = finishEvent => { if (finishEvent) move(finishEvent); overlay.removeEventListener('pointermove', move); if (item.kind === 'stroke' && item.points.length < 2) page.items.pop(); setTool('select'); };
    overlay.addEventListener('pointermove', move); overlay.addEventListener('pointerup', finish, { once: true }); overlay.addEventListener('pointercancel', finish, { once: true });
  });
}
function createNewItem(page, point, canvas) {
  const common = { id: id(), x: point.x, y: point.y, w: 1, h: 1 };
  if (state.tool === 'add-text') return { ...common, kind: 'text', w: 170, h: 26, fontSize: 14, text: '', color: '#19382e', bg: sampleBackground(canvas, point.x, point.y, 10, 10, page) };
  if (state.tool === 'add-image' || state.tool === 'replace-image') return { ...common, kind: 'image', w: 170, h: 120, data: state.pendingImage.data, replace: state.tool === 'replace-image' };
  if (state.tool === 'draw' || state.tool === 'signature') return { id: id(), kind: 'stroke', points: [point], thickness: state.tool === 'signature' ? 2.5 : 2, signature: state.tool === 'signature' };
  if (state.tool === 'line' || state.tool === 'arrow') return { id: id(), kind: state.tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  if (state.tool === 'rectangle') return { ...common, kind: 'rectangle' };
  if (state.tool === 'highlight') return { ...common, kind: 'highlight' };
  if (state.tool === 'whiteout') return { ...common, kind: 'whiteout', bg: sampleBackground(canvas, point.x, point.y, 10, 10, page) };
  return null;
}
function updateNewItem(item, start, point) { if (item.kind === 'stroke') { item.points.push(point); return; } if (item.kind === 'line' || item.kind === 'arrow') { item.x2 = point.x; item.y2 = point.y; return; } item.x = Math.min(start.x, point.x); item.y = Math.min(start.y, point.y); item.w = Math.max(6, Math.abs(point.x - start.x)); item.h = Math.max(6, Math.abs(point.y - start.y)); }
function pageAction(event, page) { event.stopPropagation(); if (event.target.dataset.pageAction === 'rotate') { snapshot(); page.rotation = (page.rotation + 90) % 360; setMessage('পেজটি ঘোরানো হয়েছে।'); renderAll(); } else { if (activePages().length < 2) { setMessage('কমপক্ষে একটি পেজ থাকতে হবে।', true); return; } snapshot(); page.deleted = true; state.selectedId = null; setMessage('পেজটি বাদ দেওয়া হয়েছে।'); renderAll(); updateButtons(); } }

async function imageToPng(file) { const url = URL.createObjectURL(file); try { const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = url; }); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png'); } finally { URL.revokeObjectURL(url); } }
async function chooseImage(file) { if (!file) return; try { state.pendingImage = { data: await imageToPng(file), name: file.name }; selectedImageName.textContent = `বাছা ছবি: ${file.name}`; setMessage('ছবি প্রস্তুত। এখন “ছবি যোগ” বা “ছবি বদল” বেছে পেজে টেনে জায়গা নির্ধারণ করুন।'); } catch { setMessage('ছবিটি পড়া যায়নি। JPG, PNG বা WebP ব্যবহার করুন।', true); } }
function addBlankPage() { snapshot(); state.pages.push({ key: `blank-${Date.now()}`, blank: true, deleted: false, initialRotation: 0, rotation: 0, baseWidth: 595.28, baseHeight: 841.89, items: [] }); setMessage('একটি ফাঁকা A4 পেজ যোগ হয়েছে।'); renderAll(); }
function deleteSelected() { const selected = selectedAnnotation(); if (!selected) return; snapshot(); selected.page.items = selected.page.items.filter(item => item.id !== selected.item.id); state.selectedId = null; renderAll(); updateButtons(); }

function displayPointToPdf(point, page) { const rotation = combinedRotation(page); const W = page.baseWidth; const H = page.baseHeight; if (rotation === 90) return { x: W - point.y, y: point.x }; if (rotation === 180) return { x: W - point.x, y: point.y }; if (rotation === 270) return { x: point.y, y: H - point.x }; return { x: point.x, y: H - point.y }; }
function displayRectToPdf(item, page) { const box = bounds(item); const rotation = combinedRotation(page); const W = page.baseWidth; const H = page.baseHeight; if (rotation === 90) return { x: W - (box.y + box.h), y: box.x, w: box.h, h: box.w }; if (rotation === 180) return { x: W - (box.x + box.w), y: box.y, w: box.w, h: box.h }; if (rotation === 270) return { x: box.y, y: H - (box.x + box.w), w: box.h, h: box.w }; return { x: box.x, y: H - (box.y + box.h), w: box.w, h: box.h }; }
async function drawItem(pdfPage, page, item, font, imageCache, document) {
  const rect = displayRectToPdf(item, page);
  if (item.kind === 'text') { pdfPage.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: cssColor(item.bg || '#ffffff') }); if (item.text.trim()) pdfPage.drawText(item.text, { x: rect.x + 2, y: rect.y + Math.max(2, rect.h - item.fontSize * 1.05), size: item.fontSize, font, color: cssColor(item.color) || rgb(0.1, 0.22, 0.18), maxWidth: Math.max(2, rect.w - 4) }); return; }
  if (item.kind === 'whiteout') { pdfPage.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: cssColor(item.bg || '#ffffff') }); return; }
  if (item.kind === 'highlight') { pdfPage.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: rgb(1, 0.85, 0.15), opacity: 0.45 }); return; }
  if (item.kind === 'rectangle') { pdfPage.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, borderColor: rgb(0.08, 0.42, 0.32), borderWidth: 2 }); return; }
  if (item.kind === 'image') { let image = imageCache.get(item.data); if (!image) { image = await document.embedPng(item.data); imageCache.set(item.data, image); } if (item.replace) pdfPage.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: rgb(1, 1, 1) }); pdfPage.drawImage(image, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }); return; }
  if (item.kind === 'line' || item.kind === 'arrow') { const a = displayPointToPdf({ x: item.x1, y: item.y1 }, page); const b = displayPointToPdf({ x: item.x2, y: item.y2 }, page); pdfPage.drawLine({ start: a, end: b, color: rgb(0.08, 0.42, 0.32), thickness: 2 }); if (item.kind === 'arrow') { const angle = Math.atan2(b.y - a.y, b.x - a.x); const length = 9; for (const offset of [Math.PI * .78, -Math.PI * .78]) pdfPage.drawLine({ start: b, end: { x: b.x + Math.cos(angle + offset) * length, y: b.y + Math.sin(angle + offset) * length }, color: rgb(0.08, 0.42, 0.32), thickness: 2 }); } return; }
  if (item.kind === 'stroke') { for (let index = 1; index < item.points.length; index++) pdfPage.drawLine({ start: displayPointToPdf(item.points[index - 1], page), end: displayPointToPdf(item.points[index], page), color: item.signature ? rgb(0.1, 0.22, 0.18) : rgb(0.08, 0.42, 0.32), thickness: item.thickness || 2 }); }
}
async function savePdf() {
  if (state.busy || !state.sourceBytes) return; state.busy = true; updateButtons(); setMessage('PDF প্রস্তুত হচ্ছে…');
  try {
    const source = await PDFDocument.load(state.sourceBytes); const output = await PDFDocument.create(); output.registerFontkit(window.fontkit); const fontBytes = await fetch('./lib/NotoSansBengali.ttf').then(response => { if (!response.ok) throw new Error(); return response.arrayBuffer(); }); const font = await output.embedFont(fontBytes, { subset: true }); const imageCache = new Map();
    for (const pageState of activePages()) { let outputPage; if (pageState.blank) outputPage = output.addPage([pageState.baseWidth, pageState.baseHeight]); else { const [copied] = await output.copyPages(source, [pageState.originalIndex]); outputPage = output.addPage(copied); } const currentAngle = outputPage.getRotation().angle || 0; outputPage.setRotation(degrees((currentAngle + pageState.rotation) % 360)); for (const item of pageState.items) await drawItem(outputPage, pageState, item, font, imageCache, output); }
    const bytes = await output.save(); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); const link = document.createElement('a'); link.href = url; link.download = 'সম্পাদিত-PDF.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); setMessage('সম্পাদিত PDF ডাউনলোডের জন্য প্রস্তুত।');
  } catch (error) { console.error(error); setMessage('PDF সেভ করা যায়নি। আবার চেষ্টা করুন।', true); } finally { state.busy = false; updateButtons(); }
}

pdfInput.addEventListener('change', () => { openPdf(pdfInput.files[0]); pdfInput.value = ''; }); imageInput.addEventListener('change', () => { chooseImage(imageInput.files[0]); imageInput.value = ''; });
for (const eventName of ['dragenter', 'dragover']) dropZone.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.add('dragging'); }); dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging')); dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('dragging'); openPdf(event.dataTransfer.files[0]); });
tools.forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool))); undoButton.addEventListener('click', undo); redoButton.addEventListener('click', redo); deleteButton.addEventListener('click', deleteSelected); $('#add-page').addEventListener('click', addBlankPage); downloadButton.addEventListener('click', savePdf);
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedId && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); deleteSelected(); } });
