# ছবি ছোট করুন

A free, Bengali, mobile-friendly static site with six tools: image compressor, image resizer, image format converter, image-to-PDF converter, QR code generator, and word and character counter. Built with HTML, CSS and vanilla JavaScript, without dependencies, accounts, APIs or a backend.

## Run

Open `index.html` in a modern browser and use the navigation menu for the other tools. No install or build step is needed. To publish, place all HTML, CSS and JavaScript files together on any static host, such as GitHub Pages, Cloudflare Pages or Netlify.

## Features

- Multiple JPG, PNG and WebP files, using the picker or drag and drop.
- Quality slider (10–100%) with automatic reprocessing.
- Original size, output size and percentage saved for each image.
- Individual downloads and download all as separate files. Your browser may ask permission for multiple downloads.
- Bengali interface and instructions, responsive layout, page title and meta description.
- Empty `ad-top` and `ad-bottom` divs reserved for future ads.
- Resizer supports exact pixel dimensions with optional aspect ratio lock, or a percentage of each image's original size. It shows input and output dimensions and file sizes for every image.
- Converter changes multiple JPG, PNG, or WebP images to a selected PNG, JPG, or WebP format, with individual and all downloads.
- Image-to-PDF converter accepts multiple JPG, PNG, and WebP images; its thumbnails can be reordered, rotated, or removed before downloading one PDF. It supports A4, Letter, or image-sized pages, page orientation, and margins.
- QR generator encodes text or a URL as a PNG QR Code. It supports UTF-8 byte mode, error correction level L, versions 1–10, and up to 271 UTF-8 bytes. Its encoder and Reed–Solomon error correction are written in vanilla JavaScript.
- Word counter updates live for Bengali and English text, showing words, grapheme characters with and without spaces, sentences, paragraphs, and reading time.

## Processing and privacy

All image decoding and compression happen locally using browser Canvas and `toBlob`. No images are uploaded, and the site makes no network requests or loads external fonts, scripts or analytics. It also works offline after the files are available locally. Adding future ads or third-party code could change this privacy behavior.

The resizer also uses Canvas locally. It preserves the input format when the browser supports encoding it. Each image keeps its own aspect ratio when the lock is enabled; the last edited dimension controls the scale. Resized output may be larger than the original file. To limit device memory use, output is capped at 16,384 pixels per side and 40 million pixels overall. Canvas re-encoding can remove metadata and animation.

The converter uses Canvas locally and preserves image dimensions. Transparent pixels are filled white when converting to JPG. The PDF converter re-encodes each selected image as JPEG in Canvas and embeds the resulting data directly into a PDF it writes in the browser; transparent pixels use a white background and image metadata is not retained. The QR generator draws its code on Canvas without external libraries or requests. The word counter runs entirely on the current page and does not save the text.

JPEG inputs are encoded as JPEG. PNG and WebP inputs are encoded as WebP to support lossy quality adjustment and transparency. Browsers without WebP encoding may return PNG instead; downloads use the actual output MIME type. The original file is retained when the encoded version is no smaller. Image dimensions are preserved. Quality is an encoder setting, not a promised size reduction; actual results vary. Canvas re-encoding does not preserve original metadata or animation.

Images are processed sequentially to limit memory use. Large images can still exceed a device's memory or canvas limits; a per-image error is shown without stopping other files. Previews and results stay in memory for the current page session; refresh or close the page to clear them.

## Manual checks

1. Open the page locally and select several JPG, PNG and WebP images, including a transparent PNG.
2. Confirm sizes and savings appear, then change quality and wait for refreshed results.
3. Download individual images and all images; verify format, dimensions and transparency.
4. Try an unsupported file and a damaged image; verify clear messages and continued processing of valid files.
5. Check keyboard navigation and a narrow mobile viewport. Disconnect the network and repeat compression to confirm offline operation.
