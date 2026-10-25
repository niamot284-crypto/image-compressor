# ছবি ছোট করুন

A free, Bengali, mobile-friendly static image compressor. Built with HTML, CSS and vanilla JavaScript, without dependencies, accounts, APIs or a backend.

## Run

Open `index.html` in a modern browser. No install or build step is needed. To publish, place `index.html`, `style.css` and `script.js` together on any static host, such as GitHub Pages, Cloudflare Pages or Netlify.

## Features

- Multiple JPG, PNG and WebP files, using the picker or drag and drop.
- Quality slider (10–100%) with automatic reprocessing.
- Original size, output size and percentage saved for each image.
- Individual downloads and download all as separate files. Your browser may ask permission for multiple downloads.
- Bengali interface and instructions, responsive layout, page title and meta description.
- Empty `ad-top` and `ad-bottom` divs reserved for future ads.

## Processing and privacy

All image decoding and compression happen locally using browser Canvas and `toBlob`. No images are uploaded, and the site makes no network requests or loads external fonts, scripts or analytics. It also works offline after the files are available locally. Adding future ads or third-party code could change this privacy behavior.

JPEG inputs are encoded as JPEG. PNG and WebP inputs are encoded as WebP to support lossy quality adjustment and transparency. Browsers without WebP encoding may return PNG instead; downloads use the actual output MIME type. The original file is retained when the encoded version is no smaller. Image dimensions are preserved. Quality is an encoder setting, not a promised size reduction; actual results vary. Canvas re-encoding does not preserve original metadata or animation.

Images are processed sequentially to limit memory use. Large images can still exceed a device's memory or canvas limits; a per-image error is shown without stopping other files. Previews and results stay in memory for the current page session; refresh or close the page to clear them.

## Manual checks

1. Open the page locally and select several JPG, PNG and WebP images, including a transparent PNG.
2. Confirm sizes and savings appear, then change quality and wait for refreshed results.
3. Download individual images and all images; verify format, dimensions and transparency.
4. Try an unsupported file and a damaged image; verify clear messages and continued processing of valid files.
5. Check keyboard navigation and a narrow mobile viewport. Disconnect the network and repeat compression to confirm offline operation.
