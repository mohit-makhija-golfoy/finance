#!/usr/bin/env node
// Regenerates two offline PDF-extraction assets from pdfjs-dist's legacy build:
//  1. frontend/assets/pdf/pdf-extract.html — pdf.js + pdf.worker inlined, plus a
//     bridge script, run inside a hidden native WebView.
//  2. frontend/src/pdf/pdfWorkerSource.ts — the worker source as a string constant,
//     turned into a Blob URL at runtime so the web build's pdfjsLib.GlobalWorkerOptions.workerSrc
//     never needs a network fetch either.
// Both avoid any CDN/network dependency, keeping extraction fully offline.
//
// Run manually with `node scripts/build-pdf-assets.js` whenever pdfjs-dist is
// upgraded. The generated files are checked into git, not built on every install.

const fs = require("fs");
const path = require("path");

const pdfjsDir = path.join(__dirname, "..", "node_modules", "pdfjs-dist", "legacy", "build");
const outDir = path.join(__dirname, "..", "assets", "pdf");
const outFile = path.join(outDir, "pdf-extract.html");
const workerSourceOutFile = path.join(__dirname, "..", "src", "pdf", "pdfWorkerSource.ts");

// Guard against a literal "</script" substring inside the minified bundles
// prematurely closing the surrounding <script> tag when inlined into HTML.
function escapeForInlineScript(src) {
  return src.replace(/<\/script/gi, "<\\/script");
}

const pdfJsSrc = escapeForInlineScript(fs.readFileSync(path.join(pdfjsDir, "pdf.min.js"), "utf8"));
const pdfWorkerSrc = escapeForInlineScript(fs.readFileSync(path.join(pdfjsDir, "pdf.worker.min.js"), "utf8"));

const bridge = `
(function () {
  function post(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function base64ToUint8Array(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Point pdf.js's worker at a Blob built from the inlined worker source, so it never
  // tries to fetch a worker script over the network. WKWebView (iOS) can throw when
  // spawning a real Worker from a blob: URL under a file:// document origin, so this
  // is wrapped defensively — extractPages() forces disableWorker below regardless,
  // meaning a failure here is harmless either way.
  try {
    var workerBlob = new Blob([document.getElementById("pdf-worker-src").textContent], {
      type: "application/javascript",
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
  } catch (e) {
    // Ignored — extractPages() runs pdf.js on the main thread via disableWorker.
  }

  function bandKey(y) {
    return Math.round(y / 3);
  }

  async function extractPages(base64, password) {
    var data = base64ToUint8Array(base64);
    // Real Workers spawned from a blob: URL under a file:// document origin are
    // unreliable in WKWebView (can throw or silently never resolve), which is why
    // this hangs on iOS while working fine on web. Running pdf.js on the main
    // thread sidesteps that entirely — this hidden WebView has nothing else to do.
    var options = { data: data, disableWorker: true };
    if (password) options.password = password;
    var doc = await window.pdfjsLib.getDocument(options).promise;
    var pages = [];
    for (var pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      var page = await doc.getPage(pageNum);
      var content = await page.getTextContent();
      var bands = new Map();
      for (var i = 0; i < content.items.length; i++) {
        var item = content.items[i];
        if (!item.str) continue;
        var x = item.transform[4];
        var y = item.transform[5];
        var key = bandKey(y);
        if (!bands.has(key)) bands.set(key, []);
        bands.get(key).push({ x: x, str: item.str });
      }
      var keys = Array.from(bands.keys()).sort(function (a, b) {
        return b - a; // top to bottom (higher y first)
      });
      var lines = keys.map(function (key) {
        var items = bands.get(key).sort(function (a, b) {
          return a.x - b.x;
        });
        return items.map(function (it) { return it.str; }).join(" ").replace(/\\s+/g, " ").trim();
      });
      pages.push(lines.filter(Boolean).join("\\n"));
    }
    return pages;
  }

  function handleMessage(event) {
    var raw = event.data;
    var msg;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!msg || msg.type !== "EXTRACT") return;
    extractPages(msg.base64, msg.password)
      .then(function (pages) {
        post({ type: "RESULT", pages: pages });
      })
      .catch(function (err) {
        if (err && err.name === "PasswordException") {
          // code 1 = NEED_PASSWORD (first attempt), 2 = INCORRECT_PASSWORD (retry).
          post({ type: "PASSWORD_REQUIRED", needsRetry: err.code === 2 });
          return;
        }
        post({ type: "ERROR", message: (err && err.message) || "Failed to read PDF." });
      });
  }

  // Android delivers postMessage on 'document', iOS on 'window' — listen on both.
  document.addEventListener("message", handleMessage);
  window.addEventListener("message", handleMessage);

  post({ type: "READY" });
})();
`;

const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script id="pdf-worker-src" type="application/octet-stream">${pdfWorkerSrc}</script>
<script>${pdfJsSrc}</script>
<script>${bridge}</script>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${(html.length / 1024).toFixed(0)} KB)`);

// Raw (unescaped) worker source for the web build — this is a plain string
// constant, not inlined into a <script> tag, so no escaping is needed.
const rawWorkerSrc = fs.readFileSync(path.join(pdfjsDir, "pdf.worker.min.js"), "utf8");
const workerModule = `// Auto-generated by scripts/build-pdf-assets.js — do not edit by hand.
// The pdfjs-dist legacy worker source, used to build an offline Blob-URL worker on web
// (see src/pdf/PdfExtractor.web.tsx) so pdf.js never needs GlobalWorkerOptions.workerSrc
// to point at a network URL.
export const PDF_WORKER_SOURCE = ${JSON.stringify(rawWorkerSrc)};
`;
fs.writeFileSync(workerSourceOutFile, workerModule, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), workerSourceOutFile)} (${(workerModule.length / 1024).toFixed(0)} KB)`);
