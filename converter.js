'use strict';

const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const formatInput = document.querySelector('#format');
const convertButton = document.querySelector('#convert-button');
const downloadAll = document.querySelector('#download-all');
const resultsSection = document.querySelector('#results-section');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const message = document.querySelector('#message');
const items = [];
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const labels = { 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP' };
const number = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 1 });
let processing = false;
let revision = 0;

function size(bytes) {
  if (bytes < 1024) return `${number.format(bytes)} B`;
  if (bytes < 1048576) return `${number.format(bytes / 1024)} KB`;
  return `${number.format(bytes / 1048576)} MB`;
}

function updateButtons() {
  convertButton.disabled = processing || items.length === 0;
  const ready = items.filter(item => item.outputUrl).length;
  downloadAll.disabled = processing || ready === 0;
  summary.textContent = `${number.format(ready)} / ${number.format(items.length)}টি ছবি প্রস্তুত`;
}

function clearOutputs() {
  revision++;
  for (const item of items) {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    item.outputUrl = null;
    item.link.hidden = true;
    item.details.textContent = `${labels[item.file.type]} · ${size(item.file.size)} → অপেক্ষায়`;
    item.status.textContent = 'নতুন ফরম্যাটে রূপান্তর করুন';
    item.status.className = 'saved';
  }
  updateButtons();
}

function createRow(file, id) {
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
  details.textContent = `${labels[file.type]} · ${size(file.size)} → অপেক্ষায়`;
  const status = document.createElement('span');
  status.className = 'saved';
  status.textContent = 'নতুন ফরম্যাটে রূপান্তর করুন';
  const link = document.createElement('a');
  link.className = 'download';
  link.textContent = 'ডাউনলোড ↓';
  link.hidden = true;
  info.append(name, details, status);
  row.append(preview, info, link);
  results.append(row);
  return { file, id, sourceUrl, details, status, link, outputUrl: null };
}

function addFiles(files) {
  let rejected = 0;
  let added = 0;
  for (const file of files) {
    if (!allowedTypes.has(file.type)) { rejected++; continue; }
    items.push(createRow(file, items.length + 1));
    added++;
  }
  message.textContent = rejected ? 'কিছু ফাইল নেওয়া যায়নি। শুধু JPG, PNG ও WebP ছবি নির্বাচন করুন।' : '';
  if (added) {
    resultsSection.hidden = false;
    clearOutputs();
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ছবিটি পড়া যায়নি।'));
    image.src = url;
  });
}

async function convertImage(item, type) {
  const image = await loadImage(item.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas চালু করা যায়নি।');
    if (type === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
    if (!blob || blob.type !== type) throw new Error('এই ব্রাউজারে নির্বাচিত ফরম্যাটে সেভ করা যায়নি।');
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function processImages() {
  if (processing || !items.length) return;
  clearOutputs();
  const current = revision;
  const type = formatInput.value;
  processing = true;
  updateButtons();
  for (const item of items) {
    if (current !== revision) break;
    item.status.textContent = 'রূপান্তর হচ্ছে…';
    try {
      const blob = await convertImage(item, type);
      if (current !== revision) break;
      item.outputUrl = URL.createObjectURL(blob);
      item.link.href = item.outputUrl;
      item.link.download = `${item.file.name.replace(/\.[^.]+$/, '')}-converted-${item.id}.${extensions[type]}`;
      item.link.hidden = false;
      item.details.textContent = `${labels[item.file.type]} · ${size(item.file.size)} → ${labels[type]} · ${size(blob.size)}`;
      item.status.textContent = 'ডাউনলোডের জন্য প্রস্তুত';
      item.status.className = 'saved';
    } catch (error) {
      if (current !== revision) break;
      item.status.textContent = error.message || 'ছবিটি রূপান্তর করা যায়নি।';
      item.status.className = 'saved error';
    }
    updateButtons();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  processing = false;
  updateButtons();
}

fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
for (const event of ['dragenter', 'dragover']) dropZone.addEventListener(event, e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragging'); addFiles(e.dataTransfer.files); });
formatInput.addEventListener('change', clearOutputs);
convertButton.addEventListener('click', processImages);
downloadAll.addEventListener('click', () => { if (!processing) for (const item of items) if (item.outputUrl) item.link.click(); });
window.addEventListener('pagehide', () => {
  for (const item of items) {
    URL.revokeObjectURL(item.sourceUrl);
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  }
});
