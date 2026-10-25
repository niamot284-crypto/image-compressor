'use strict';

const input = document.querySelector('#file-input');
const quality = document.querySelector('#quality');
const qualityValue = document.querySelector('#quality-value');
const dropZone = document.querySelector('#drop-zone');
const results = document.querySelector('#results');
const section = document.querySelector('#results-section');
const summary = document.querySelector('#summary');
const message = document.querySelector('#message');
const downloadAll = document.querySelector('#download-all');
const items = [];
const bn = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 1 });
let revision = 0;
let running = false;
let timer;

function size(bytes) {
  return bytes < 1024 ? `${bn.format(bytes)} B` : bytes < 1048576 ? `${bn.format(bytes / 1024)} KB` : `${bn.format(bytes / 1048576)} MB`;
}

function updateSummary() {
  const ready = items.filter(item => item.blob);
  summary.textContent = `${bn.format(ready.length)} / ${bn.format(items.length)}টি ছবি প্রস্তুত`;
  downloadAll.disabled = running || ready.length === 0;
}

function addFiles(files) {
  let rejected = 0;
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { rejected++; continue; }
    const row = document.createElement('article');
    row.className = 'result';
    const preview = document.createElement('img');
    preview.className = 'preview';
    preview.alt = '';
    const sourceUrl = URL.createObjectURL(file);
    preview.src = sourceUrl;
    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('p');
    name.className = 'file-name';
    name.textContent = file.name;
    const details = document.createElement('p');
    details.className = 'file-size';
    details.textContent = `${size(file.size)} → অপেক্ষা করুন…`;
    const status = document.createElement('span');
    status.className = 'saved';
    const link = document.createElement('a');
    link.className = 'download';
    link.textContent = 'ডাউনলোড ↓';
    link.hidden = true;
    info.append(name, details, status);
    row.append(preview, info, link);
    results.append(row);
    items.push({ file, sourceUrl, details, status, link, blob: null, url: null });
  }
  message.textContent = rejected ? 'কিছু ফাইল নেওয়া যায়নি। শুধু JPG, PNG ও WebP ছবি নির্বাচন করুন।' : '';
  section.hidden = items.length === 0;
  if (items.length) schedule();
}

function schedule() {
  revision++;
  clearTimeout(timer);
  downloadAll.disabled = true;
  for (const item of items) { item.link.hidden = true; }
  timer = setTimeout(processQueue, 180);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ছবিটি পড়া যায়নি।'));
    img.src = url;
  });
}

async function compress(item, value) {
  const img = await loadImage(item.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas চালু করা যায়নি।');
    context.drawImage(img, 0, 0);
    const type = item.file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, value));
    if (!blob) throw new Error('ছবিটি কমপ্রেস করা যায়নি।');
    return blob.size < item.file.size ? blob : item.file;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function processQueue() {
  if (running) return;
  running = true;
  let current;
  do {
    current = revision;
    const value = Number(quality.value) / 100;
    for (const item of items) {
      if (current !== revision) break;
      item.status.className = 'saved';
      item.status.textContent = 'কমপ্রেস হচ্ছে…';
      try {
        const blob = await compress(item, value);
        if (current !== revision) break;
        if (item.url) URL.revokeObjectURL(item.url);
        item.blob = blob;
        item.url = URL.createObjectURL(blob);
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'png';
        item.link.href = item.url;
        item.link.download = `${item.file.name.replace(/\.[^.]+$/, '')}-compressed.${ext}`;
        item.link.hidden = false;
        item.details.textContent = `${size(item.file.size)} → ${size(blob.size)}`;
        const saved = (1 - blob.size / item.file.size) * 100;
        item.status.textContent = saved > 0 ? `${bn.format(saved)}% সাশ্রয়` : '০% সাশ্রয় · মূল ছবিটিই সবচেয়ে ছোট';
      } catch (error) {
        if (current !== revision) break;
        if (item.url) URL.revokeObjectURL(item.url);
        item.url = null;
        item.blob = null;
        item.link.hidden = true;
        item.details.textContent = size(item.file.size);
        item.status.className = 'saved error';
        item.status.textContent = 'ছবিটি প্রসেস করা যায়নি। অন্য ছবি বা কম মান দিয়ে চেষ্টা করুন।';
      }
      updateSummary();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } while (current !== revision);
  running = false;
  updateSummary();
}

input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
quality.addEventListener('input', () => {
  qualityValue.value = `${bn.format(Number(quality.value))}%`;
  if (items.length) schedule();
});
for (const event of ['dragenter', 'dragover']) {
  dropZone.addEventListener(event, e => { e.preventDefault(); dropZone.classList.add('dragging'); });
}
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  addFiles(e.dataTransfer.files);
});
downloadAll.addEventListener('click', () => {
  if (running) return;
  for (const item of items) {
    if (item.blob && !item.link.hidden) item.link.click();
  }
});
