'use strict';

// QR Code Model 2, byte mode, error correction level L, versions 1–10.
// All encoding, error correction, masking, and drawing happen in this file.
const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const BLOCK_COUNT = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const textInput = document.querySelector('#qr-text');
const sizeInput = document.querySelector('#qr-size');
const canvas = document.querySelector('#qr-canvas');
const result = document.querySelector('#qr-result');
const errorBox = document.querySelector('#qr-error');

function rawModuleCount(version) {
  let count = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignCount = Math.floor(version / 7) + 2;
    count -= (25 * alignCount - 10) * alignCount - 55;
    if (version >= 7) count -= 36;
  }
  return count;
}

function appendBits(target, value, length) {
  for (let i = length - 1; i >= 0; i--) target.push((value >>> i) & 1);
}

function encodeData(text) {
  const bytes = new TextEncoder().encode(text);
  let version = 0;
  let dataCodewords = 0;
  for (let v = 1; v <= 10; v++) {
    const capacity = Math.floor(rawModuleCount(v) / 8) - ECC_PER_BLOCK[v] * BLOCK_COUNT[v];
    const countBits = v <= 9 ? 8 : 16;
    if (bytes.length < 2 ** countBits && 4 + countBits + bytes.length * 8 <= capacity * 8) {
      version = v;
      dataCodewords = capacity;
      break;
    }
  }
  if (!version) throw new Error('লেখাটি QR কোডের জন্য খুব বড়। ২৭১ UTF-8 বাইটের মধ্যে রাখুন।');
  const bits = [];
  appendBits(bits, 4, 4); // byte mode
  appendBits(bits, bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) appendBits(bits, byte, 8);
  appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  let pad = 0xec;
  while (data.length < dataCodewords) {
    data.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return { version, data };
}

function gfMultiply(a, b) {
  let product = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) product ^= a;
    b >>>= 1;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return product;
}

function reedSolomonGenerator(degree) {
  let polynomial = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = Array(polynomial.length + 1).fill(0);
    for (let j = 0; j < polynomial.length; j++) {
      next[j] ^= polynomial[j];
      next[j + 1] ^= gfMultiply(polynomial[j], root);
    }
    polynomial = next;
    root = gfMultiply(root, 2);
  }
  return polynomial.slice(1);
}

function reedSolomonRemainder(data, generator) {
  const remainder = new Uint8Array(generator.length);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[remainder.length - 1] = 0;
    for (let i = 0; i < generator.length; i++) remainder[i] ^= gfMultiply(generator[i], factor);
  }
  return [...remainder];
}

function addErrorCorrection(data, version) {
  const rawCodewords = Math.floor(rawModuleCount(version) / 8);
  const blockCount = BLOCK_COUNT[version];
  const eccLength = ECC_PER_BLOCK[version];
  const shortBlocks = blockCount - rawCodewords % blockCount;
  const shortDataLength = Math.floor(rawCodewords / blockCount) - eccLength;
  const generator = reedSolomonGenerator(eccLength);
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i++) {
    const length = shortDataLength + (i >= shortBlocks ? 1 : 0);
    const part = data.slice(offset, offset + length);
    offset += length;
    blocks.push({ data: part, ecc: reedSolomonRemainder(part, generator) });
  }
  const output = [];
  for (let i = 0; i <= shortDataLength; i++) for (const block of blocks) if (i < block.data.length) output.push(block.data[i]);
  for (let i = 0; i < eccLength; i++) for (const block of blocks) output.push(block.ecc[i]);
  if (output.length !== rawCodewords) throw new Error('QR কোড তৈরি করা যায়নি।');
  return output;
}

function maskAt(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return x * y % 2 + x * y % 3 === 0;
    case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
    default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
  }
}

function makeMatrix(version, codewords) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const setFunction = (x, y, dark) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      modules[y][x] = Boolean(dark);
      reserved[y][x] = true;
    }
  };
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(cx + dx, cy + dy, distance !== 2 && distance !== 4);
    }
  }
  const centers = ALIGNMENT[version];
  for (let yi = 0; yi < centers.length; yi++) for (let xi = 0; xi < centers.length; xi++) {
    if ((xi === 0 && yi === 0) || (xi === centers.length - 1 && yi === 0) || (xi === 0 && yi === centers.length - 1)) continue;
    const cx = centers[xi];
    const cy = centers[yi];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1;
      const a = size - 11 + i % 3;
      const b = Math.floor(i / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  }
  function drawFormat(mask) {
    const data = (1 << 3) | mask; // error correction level L
    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;
    const bit = i => (bits >>> i) & 1;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i));
    setFunction(8, size - 8, true);
  }
  drawFormat(0); // reserve format cells before placing data
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (!reserved[y][x]) {
          modules[y][x] = bitIndex < codewords.length * 8 ? Boolean((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) : false;
          bitIndex++;
        }
      }
    }
  }
  if (bitIndex !== rawModuleCount(version)) throw new Error('QR কোড তৈরি করা যায়নি।');
  function applyMask(mask) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!reserved[y][x] && maskAt(mask, x, y)) modules[y][x] = !modules[y][x];
  }
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const penalty = penaltyScore(modules);
    if (penalty < bestPenalty) { bestPenalty = penalty; bestMask = mask; }
    applyMask(mask);
  }
  applyMask(bestMask);
  drawFormat(bestMask);
  return modules;
}

function penaltyScore(modules) {
  const size = modules.length;
  let score = 0;
  const lines = [...modules, ...Array.from({ length: size }, (_, x) => modules.map(row => row[x]))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (line[i] === line[i - 1]) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score++;
      } else run = 1;
    }
    const sequence = line.map(value => value ? '1' : '0').join('');
    for (let i = 0; i <= size - 11; i++) {
      const part = sequence.slice(i, i + 11);
      if (part === '10111010000' || part === '00001011101') score += 40;
    }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const color = modules[y][x];
    if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

function createQr(text) {
  const encoded = encodeData(text);
  return makeMatrix(encoded.version, addErrorCorrection(encoded.data, encoded.version));
}

function drawQr(modules, pixels) {
  const quiet = 4;
  const total = modules.length + quiet * 2;
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pixels, pixels);
  context.fillStyle = '#000000';
  for (let y = 0; y < modules.length; y++) for (let x = 0; x < modules.length; x++) if (modules[y][x]) {
    const x0 = Math.floor((x + quiet) * pixels / total);
    const x1 = Math.floor((x + quiet + 1) * pixels / total);
    const y0 = Math.floor((y + quiet) * pixels / total);
    const y1 = Math.floor((y + quiet + 1) * pixels / total);
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = !text;
}

document.querySelector('#generate-button').addEventListener('click', () => {
  const text = textInput.value;
  if (!text.trim()) { result.hidden = true; showError('QR কোডের জন্য লেখা বা URL লিখুন।'); return; }
  try {
    drawQr(createQr(text), Number(sizeInput.value));
    showError('');
    result.hidden = false;
  } catch (error) {
    result.hidden = true;
    showError(error.message || 'QR কোড তৈরি করা যায়নি।');
  }
});
textInput.addEventListener('input', () => { result.hidden = true; showError(''); });
sizeInput.addEventListener('change', () => { result.hidden = true; showError(''); });
document.querySelector('#download-button').addEventListener('click', () => {
  if (result.hidden) return;
  canvas.toBlob(blob => {
    if (!blob) { showError('PNG ডাউনলোড করা যায়নি।'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qr-code.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 'image/png');
});
