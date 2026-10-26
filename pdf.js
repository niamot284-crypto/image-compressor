'use strict';

const fileInput = document.querySelector('#file-input');
const dropZone = document.querySelector('#drop-zone');
const list = document.querySelector('#file-list');
const message = document.querySelector('#message');
const createButton = document.querySelector('#create-pdf');
const pageSize = document.querySelector('#page-size');
const orientation = document.querySelector('#orientation');
const marginInput = document.querySelector('#margin');
const files = [];
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const number = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 1 });
const encoder = new TextEncoder();
let busy = false;
let nextId = 1;

function bytes(size) {
  if (size < 1024) return `${number.format(size)} B`;
  if (size < 1048576) return `${number.format(size / 1024)} KB`;
  return `${number.format(size / 1048576)} MB`;
}

function ascii(text) { return encoder.encode(text); }

function joinBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ছবিটি পড়া যায়নি।'));
    image.src = url;
  });
}

function imageDimensions(item) {
  return item.rotation % 180 ? { width: item.height, height: item.width } : { width: item.width, height: item.height };
}

function updateButton() {
  createButton.disabled = busy || files.length === 0;
  createButton.textContent = busy ? 'PDF তৈরি হচ্ছে…' : 'PDF তৈরি ও ডাউনলোড করুন ↓';
}

function renderList() {
  list.replaceChildren();
  for (const [index, item] of files.entries()) {
    const card = document.createElement('article');
    card.className = 'pdf-item';
    const preview = document.createElement('img');
    preview.className = 'pdf-thumb';
    preview.src = item.url;
    preview.alt = '';
    const info = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'pdf-file-name';
    name.textContent = item.file.name;
    const detail = document.createElement('p');
    detail.className = 'pdf-file-info';
    const dim = imageDimensions(item);
    detail.textContent = `${number.format(index + 1)}. ${number.format(dim.width)} × ${number.format(dim.height)} পিক্সেল · ${bytes(item.file.size)} · ${number.format(item.rotation)}°`;
    info.append(name, detail);
    const actions = document.createElement('div');
    actions.className = 'pdf-actions';
    const action = (label, title, handler, disabled = false, className = '') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.disabled = disabled || busy;
      if (className) button.className = className;
      button.addEventListener('click', handler);
      return button;
    };
    actions.append(
      action('↑', 'এক ধাপ ওপরে নিন', () => moveItem(index, -1), index === 0),
      action('↓', 'এক ধাপ নিচে নিন', () => moveItem(index, 1), index === files.length - 1),
      action('↻', '৯০ ডিগ্রি ঘোরান', () => { item.rotation = (item.rotation + 90) % 360; renderList(); }),
      action('×', 'ছবিটি বাদ দিন', () => removeItem(index), false, 'remove')
    );
    card.append(preview, info, actions);
    list.append(card);
  }
  updateButton();
}

function moveItem(index, movement) {
  const destination = index + movement;
  if (destination < 0 || destination >= files.length) return;
  [files[index], files[destination]] = [files[destination], files[index]];
  renderList();
}

function removeItem(index) {
  const [item] = files.splice(index, 1);
  URL.revokeObjectURL(item.url);
  renderList();
}

async function addFiles(selected) {
  let rejected = 0;
  const newItems = [];
  for (const file of selected) {
    if (!allowed.has(file.type)) { rejected++; continue; }
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error();
      newItems.push({ id: nextId++, file, url, width: image.naturalWidth, height: image.naturalHeight, rotation: 0 });
    } catch {
      URL.revokeObjectURL(url);
      rejected++;
    }
  }
  files.push(...newItems);
  message.textContent = rejected ? 'কিছু ফাইল নেওয়া যায়নি। শুধু পড়া যায় এমন JPG, PNG ও WebP ছবি নির্বাচন করুন।' : '';
  renderList();
}

async function jpegForItem(item) {
  const image = await loadImage(item.url);
  const dim = imageDimensions(item);
  const canvas = document.createElement('canvas');
  canvas.width = dim.width;
  canvas.height = dim.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas চালু করা যায়নি।');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (item.rotation === 90) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
    if (item.rotation === 180) { context.translate(canvas.width, canvas.height); context.rotate(Math.PI); }
    if (item.rotation === 270) { context.translate(0, canvas.height); context.rotate(-Math.PI / 2); }
    context.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('ছবিটি PDF-এর জন্য তৈরি করা যায়নি।');
    return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function fixedPage(size, direction) {
  const dimensions = size === 'letter' ? [612, 792] : [595.28, 841.89];
  return direction === 'landscape' ? { width: dimensions[1], height: dimensions[0] } : { width: dimensions[0], height: dimensions[1] };
}

function pageForImage(image, size, direction, margin) {
  if (size === 'image') return { width: image.width * 0.75 + margin * 2, height: image.height * 0.75 + margin * 2 };
  return fixedPage(size, direction);
}

function imagePlacement(image, page, margin) {
  const availableWidth = Math.max(1, page.width - margin * 2);
  const availableHeight = Math.max(1, page.height - margin * 2);
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { width, height, x: (page.width - width) / 2, y: (page.height - height) / 2 };
}

function pdfObject(body) { return ascii(body); }

function streamObject(dictionary, stream) {
  return joinBytes([ascii(`${dictionary} /Length ${stream.length} >>\nstream\n`), stream, ascii('\nendstream')]);
}

function buildPdf(images, settings) {
  const objects = [];
  objects[1] = pdfObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pageRefs = [];
  let objectNumber = 3;
  for (const image of images) {
    const page = pageForImage(image, settings.size, settings.orientation, settings.margin);
    const place = imagePlacement(image, page, settings.margin);
    const pageNumber = objectNumber++;
    const contentNumber = objectNumber++;
    const imageNumber = objectNumber++;
    pageRefs.push(`${pageNumber} 0 R`);
    const content = ascii(`q\n${place.width.toFixed(3)} 0 0 ${place.height.toFixed(3)} ${place.x.toFixed(3)} ${place.y.toFixed(3)} cm\n/Im0 Do\nQ`);
    objects[pageNumber] = pdfObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width.toFixed(3)} ${page.height.toFixed(3)}] /Resources << /XObject << /Im0 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`);
    objects[contentNumber] = streamObject('<<', content);
    objects[imageNumber] = streamObject(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.data);
  }
  objects[2] = pdfObject(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`);
  const chunks = [joinBytes([ascii('%PDF-1.4\n%'), new Uint8Array([0xE2, 0xE3, 0xCF, 0xD3, 0x0A])])];
  const offsets = [0];
  let position = chunks[0].length;
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = position;
    const object = joinBytes([ascii(`${index} 0 obj\n`), objects[index], ascii('\nendobj\n')]);
    chunks.push(object);
    position += object.length;
  }
  const xref = position;
  chunks.push(ascii(`xref\n0 ${objects.length}\n0000000000 65535 f \n`));
  for (let index = 1; index < objects.length; index++) chunks.push(ascii(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`));
  chunks.push(ascii(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return joinBytes(chunks);
}

async function createPdf() {
  if (busy || !files.length) return;
  const marginMm = Number(marginInput.value);
  if (!Number.isFinite(marginMm) || marginMm < 0 || marginMm > 50) { message.textContent = 'মার্জিন ০ থেকে ৫০ মিলিমিটারের মধ্যে লিখুন।'; return; }
  busy = true;
  message.textContent = 'ছবিগুলো দিয়ে PDF তৈরি হচ্ছে…';
  renderList();
  try {
    const images = [];
    for (const item of files) {
      images.push(await jpegForItem(item));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const data = buildPdf(images, { size: pageSize.value, orientation: orientation.value, margin: marginMm * 72 / 25.4 });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ছবি-থেকে-PDF.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message.textContent = `${number.format(files.length)}টি ছবি দিয়ে PDF তৈরি হয়েছে।`;
  } catch (error) {
    message.textContent = error.message || 'PDF তৈরি করা যায়নি। ছবি ছোট করে আবার চেষ্টা করুন।';
  } finally {
    busy = false;
    renderList();
  }
}

fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
for (const event of ['dragenter', 'dragover']) dropZone.addEventListener(event, eventObject => { eventObject.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('dragging'); addFiles(event.dataTransfer.files); });
createButton.addEventListener('click', createPdf);
window.addEventListener('pagehide', () => files.forEach(item => URL.revokeObjectURL(item.url)));
