let loading;
export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const existing = /** @type {HTMLScriptElement|null} */ (document.querySelector(`script[src="${src}"]`));
    const script = existing || document.createElement('script');
    let timer;
    function cleanup() { clearTimeout(timer); script.removeEventListener('load', ready); script.removeEventListener('error', failed); }
    function failed() { cleanup(); script.remove(); loading = null; reject(new Error('PDF preview is unavailable. Continue without slides.')); }
    function ready() {
      if (!window.pdfjsLib) { failed(); return; }
      cleanup();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    }
    script.addEventListener('load', ready, { once: true }); script.addEventListener('error', failed, { once: true });
    timer = setTimeout(failed, 8000);
    if (!existing) { script.src = src; script.dataset.pdfjs = 'true'; document.head.appendChild(script); }
  });
  return loading;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function buildPdfSource(source) {
  if (!source) {
    throw new Error("Missing PDF source");
  }

  if (source.startsWith("blob:") || source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }

  const base64 = source.split(",")[1];
  const bytes = base64ToUint8Array(base64);
  return { data: bytes };
}

export async function extractPdfPageTexts(source) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument(buildPdfSource(source)).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }

  return pages;
}
