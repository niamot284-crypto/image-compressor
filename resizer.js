'use strict';

const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const widthInput = document.querySelector('#width');
const heightInput = document.querySelector('#height');
const percentInput = document.querySelector('#percent');
const keepRatio = document.querySelector('#keep-ratio');
const pixelControls = document.querySelector('#pixel-controls');
const percentControls = document.querySelector('#percent-controls');
const resizeButton = document.querySelector('#resize-button');
const downloadAll = document.querySelector('#download-all');
const resultsSection = document.querySelector('#results-section');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const message = document.querySelector('#message');
const validation = document.querySelector('#validation');
const items = [];
const number = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 1 });
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxSide = 16384;
const maxPixels = 40000000;
let loading = 0;
let processing = false;
let revision = 0;
let lastEdited = 'width';

function size(bytes) {
  if (bytes < 1024) return `${number.format(bytes)} B`;
  if (bytes < 1048576) return `${number.format(bytes / 1024)} KB`;
  return `${number.format(bytes / 1048576)} MB`;
}

function dimensions(width, height) {
  return `${number.format(width)} × ${number.format(height)} পিক্সেল`;
}

function mode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function referenceImage() {
  return items.find(item => item.width && item.height);
}

function clearOutputs() {
  revision++;
  for (const item of items) {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    item.outputUrl = null;
    item.link.hidden = true;
    if (item.width) {
      item.details.textContent = `${dimensions(item.width, item.height)} · ${size(item.file.size)} → অপেক্ষায়`;
      item.status.textContent = 'নতুন মাপ দিয়ে রিসাইজ করুন';
      item.status.className = 'saved';
    }
  }
  updateButtons();
}

function updateButtons() {
  resizeButton.disabled = processing || loading > 0 || !referenceImage();
  const ready = items.filter(item => item.outputUrl).length;
  downloadAll.disabled = processing || ready === 0;
  summary.textContent = `${number.format(ready)} / ${number.format(items.length)}টি ছবি প্রস্তুত`;
}

function showValidation(text) {
  validation.textContent = text;
  validation.hidden = !text;
}

function integerValue(input) {
  const value = Number(input.value);
  return input.value.trim() && Number.isSafeInteger(value) ? value : NaN;
}

function targetSize(item) {
  let width;
  let height;
  if (mode() === 'percent') {
    const percent = integerValue(percentInput);
    if (percent < 1 || percent > 1000 || !Number.isFinite(percent)) throw new Error('১ থেকে ১০০০-এর মধ্যে পূর্ণ শতাংশ লিখুন।');
    width = Math.max(1, Math.round(item.width * percent / 100));
    height = Math.max(1, Math.round(item.height * percent / 100));
  } else if (keepRatio.checked) {
    if (lastEdited === 'height') {
      height = integerValue(heightInput);
      width = Math.max(1, Math.round(item.width * height / item.height));
    } else {
      width = integerValue(widthInput);
      height = Math.max(1, Math.round(item.height * width / item.width));
    }
  } else {
    width = integerValue(widthInput);
    height = integerValue(heightInput);
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('প্রস্থ ও উচ্চতায় ১ বা তার বেশি পূর্ণ সংখ্যা লিখুন।');
  if (width > maxSide || height > maxSide || width * height > maxPixels) throw new Error('নতুন মাপ খুব বড়। প্রতিটি মাত্রা ১৬,৩৮৪ পিক্সেল এবং মোট ৪ কোটি পিক্সেলের মধ্যে রাখুন।');
  return { width, height };
}

function syncRatio(changed) {
  lastEdited = changed;
  if (!keepRatio.checked || mode() !== 'pixels') return;
  const reference = referenceImage();
  if (!reference) return;
  if (changed === 'width') {
    const width = integerValue(widthInput);
    heightInput.value = Number.isSafeInteger(width) && width > 0 ? Math.max(1, Math.round(reference.height * width / reference.width)) : '';
  } else {
    const height = integerValue(heightInput);
    widthInput.value = Number.isSafeInteger(height) && height > 0 ? Math.max(1, Math.round(reference.width * height / reference.height)) : '';
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

function createRow(file) {
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
  details.textContent = `${size(file.size)} · মাপ পড়া হচ্ছে…`;
  const status = document.createElement('span');
  status.className = 'saved';
  const link = document.createElement('a');
  link.className = 'download';
  link.textContent = 'ডাউনলোড ↓';
  link.hidden = true;
  info.append(name, details, status);
  row.append(preview, info, link);
  results.append(row);
  return { file, sourceUrl, details, status, link, width: 0, height: 0, outputUrl: null };
}

async function addFiles(files) {
  let rejected = 0;
  const accepted = [];
  for (const file of files) {
    if (!allowedTypes.has(file.type)) { rejected++; continue; }
    const item = createRow(file);
    items.push(item);
    accepted.push(item);
  }
  message.textContent = rejected ? 'কিছু ফাইল নেওয়া যায়নি। শুধু JPG, PNG ও WebP ছবি নির্বাচন করুন।' : '';
  if (!accepted.length) return;
  clearOutputs();
  resultsSection.hidden = false;
  loading++;
  updateButtons();
  for (const item of accepted) {
    try {
      const image = await loadImage(item.sourceUrl);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('ছবিটির মাপ পড়া যায়নি।');
      item.width = image.naturalWidth;
      item.height = image.naturalHeight;
      item.details.textContent = `${dimensions(item.width, item.height)} · ${size(item.file.size)} → অপেক্ষায়`;
      item.status.textContent = 'নতুন মাপ দিয়ে রিসাইজ করুন';
      if (!widthInput.value && !heightInput.value) {
        widthInput.value = item.width;
        heightInput.value = item.height;
      }
    } catch {
      item.details.textContent = size(item.file.size);
      item.status.textContent = 'ছবিটি পড়া যায়নি।';
      item.status.className = 'saved error';
    }
  }
  loading--;
  updateButtons();
}

async function resizeImage(item, target) {
  const image = await loadImage(item.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas চালু করা যায়নি।');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, target.width, target.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, item.file.type, 0.92));
    if (!blob) throw new Error('ছবিটি রিসাইজ করা যায়নি।');
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function downloadName(item, target, blob) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'png';
  return `${item.file.name.replace(/\.[^.]+$/, '')}-resized-${target.width}x${target.height}.${extension}`;
}

async function processImages() {
  if (processing || loading || !referenceImage()) return;
  const pending = [];
  for (const item of items) {
    if (!item.width) continue;
    try {
      pending.push({ item, target: targetSize(item) });
    } catch (error) {
      showValidation(error.message);
      return;
    }
  }
  showValidation('');
  clearOutputs();
  const thisRevision = revision;
  processing = true;
  updateButtons();
  for (const { item, target } of pending) {
    if (thisRevision !== revision) break;
    item.status.textContent = 'রিসাইজ হচ্ছে…';
    try {
      const blob = await resizeImage(item, target);
      if (thisRevision !== revision) break;
      item.outputUrl = URL.createObjectURL(blob);
      item.link.href = item.outputUrl;
      item.link.download = downloadName(item, target, blob);
      item.link.hidden = false;
      item.details.textContent = `${dimensions(item.width, item.height)} · ${size(item.file.size)} → ${dimensions(target.width, target.height)} · ${size(blob.size)}`;
      item.status.textContent = 'ডাউনলোডের জন্য প্রস্তুত';
      item.status.className = 'saved';
    } catch {
      if (thisRevision !== revision) break;
      item.details.textContent = `${dimensions(item.width, item.height)} · ${size(item.file.size)}`;
      item.status.textContent = 'এই ছবিটি রিসাইজ করা যায়নি। ছোট মাপ দিয়ে চেষ্টা করুন।';
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
for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', () => {
  const pixels = mode() === 'pixels';
  pixelControls.hidden = !pixels;
  percentControls.hidden = pixels;
  showValidation('');
  clearOutputs();
});
widthInput.addEventListener('input', () => { syncRatio('width'); showValidation(''); clearOutputs(); });
heightInput.addEventListener('input', () => { syncRatio('height'); showValidation(''); clearOutputs(); });
percentInput.addEventListener('input', () => { showValidation(''); clearOutputs(); });
keepRatio.addEventListener('change', () => { if (keepRatio.checked) syncRatio(lastEdited); showValidation(''); clearOutputs(); });
resizeButton.addEventListener('click', processImages);
downloadAll.addEventListener('click', () => {
  if (processing) return;
  for (const item of items) if (item.outputUrl) item.link.click();
});
window.addEventListener('pagehide', () => {
  for (const item of items) {
    URL.revokeObjectURL(item.sourceUrl);
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  }
});
