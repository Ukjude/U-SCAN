/* ═══════════════════════════════════════════════
   U-SCAN — app.js  (OCR enhanced)
   ═══════════════════════════════════════════════ */

/* ── 1. LOADER ───────────────────────────────── */
window.addEventListener('load', () => {
  const loader = document.getElementById('loader');
  setTimeout(() => {
    loader.classList.add('hide');
    setTimeout(initReveal, 400);
  }, 2200);
});

/* ── 2. NAVBAR SCROLL ────────────────────────── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── 3. HAMBURGER ────────────────────────────── */
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');
hamburger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  hamburger.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', open);
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.classList.remove('open');
  });
});

/* ── 4. SMOOTH SCROLL ────────────────────────── */
function smoothScroll(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ── 5. SCROLL REVEAL ────────────────────────── */
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const parent = entry.target.closest('.features-grid,.pricing-grid,.steps-grid');
        if (parent) {
          const siblings = Array.from(parent.querySelectorAll('.reveal'));
          const idx = siblings.indexOf(entry.target);
          entry.target.style.transitionDelay = `${idx * 0.08}s`;
        }
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}
if (document.readyState === 'complete') setTimeout(initReveal, 600);

/* ── 6. COUNTER ANIMATION ────────────────────── */
function animateCount(el, target, duration = 1200) {
  let start = null;
  const step = ts => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}
const countObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      animateCount(e.target, parseInt(e.target.dataset.target, 10));
      countObs.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.count').forEach(el => countObs.observe(el));

/* ══════════════════════════════════════════════
   CAMERA + OCR ENGINE
   ══════════════════════════════════════════════ */

let stream      = null;
let torchOn     = false;
let ocrWorker   = null;
let isScanning  = false;

/* ── 7. INIT TESSERACT ───────────────────────── */
async function initOCR() {
  try {
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          setStatus('reading', `<div class="spinner"></div> Reading label… ${pct}%`);
        }
      }
    });
    // Tune for price label reading
    await ocrWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:-/₦#@&()',
      tessedit_pageseg_mode: '6',   // Assume single block of text
      preserve_interword_spaces: '1',
    });
    console.log('✅ OCR engine ready');
  } catch (err) {
    console.warn('OCR init failed:', err);
  }
}
initOCR();

/* ── 8. START CAMERA ─────────────────────────── */
async function startCamera() {
  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        focusMode: 'continuous',
        zoom: true,
      }
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('video-feed');
    video.srcObject = stream;

    document.getElementById('camera-placeholder').style.display = 'none';
    document.getElementById('video-wrap').style.display = 'block';
    document.getElementById('scan-overlay').classList.add('active');
    document.getElementById('start-camera-btn').style.display = 'none';
    document.getElementById('capture-btn').style.display = 'block';

    // Show zoom if supported
    const track = stream.getVideoTracks()[0];
    const caps  = track.getCapabilities();
    if (caps.zoom) {
      document.getElementById('zoom-wrap').classList.add('show');
      const slider = document.getElementById('zoom-slider');
      slider.min   = caps.zoom.min;
      slider.max   = Math.min(caps.zoom.max, 5);
      slider.value = 1;
    }
  } catch (err) {
    alert('Camera access denied or unavailable.\nPlease allow camera permission in your browser settings and try again.');
  }
}

/* ── 9. TORCH ────────────────────────────────── */
async function toggleTorch() {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  torchOn = !torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    document.getElementById('torch-btn').classList.toggle('on', torchOn);
  } catch {
    document.getElementById('torch-btn').style.display = 'none';
  }
}

/* ── 10. ZOOM ────────────────────────────────── */
async function setZoom(val) {
  document.getElementById('zoom-label').textContent = parseFloat(val).toFixed(1) + '×';
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  try {
    await track.applyConstraints({ advanced: [{ zoom: parseFloat(val) }] });
  } catch {}
}

/* ── 11. CAPTURE + OCR ───────────────────────── */
async function captureFrame() {
  if (isScanning) return;
  const video  = document.getElementById('video-feed');
  const canvas = document.getElementById('capture-canvas');
  const ctx    = canvas.getContext('2d');

  // Crop to the label zone (centre 80% wide, 68% tall — matches corner brackets)
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cropX = vw * 0.10;
  const cropY = vh * 0.14;
  const cropW = vw * 0.80;
  const cropH = vh * 0.68;

  canvas.width  = cropW;
  canvas.height = cropH;

  // Draw cropped frame
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Enhance for OCR
  enhanceForOCR(ctx, cropW, cropH);

  // Show preview
  const preview = document.getElementById('capture-preview');
  preview.classList.add('show');
  document.getElementById('video-wrap').style.opacity = '0.4';

  // Run OCR
  isScanning = true;
  document.getElementById('capture-btn').disabled = true;
  setStatus('reading', '<div class="spinner"></div> Analysing label…');

  try {
    if (!ocrWorker) await initOCR();
    const { data } = await ocrWorker.recognize(canvas);
    const rawText  = data.text.trim();
    const confidence = Math.round(data.confidence);

    document.getElementById('ocr-raw-text').textContent = rawText || '(nothing detected)';
    showConfidence(confidence);

    const parsed = parseLabel(rawText);
    populateForm(parsed, confidence);

    if (parsed.price) {
      setStatus('success', `✅ Label read! Confidence: ${confidence}% — Check and add below.`);
    } else {
      setStatus('error', `⚠️ Could not read price. Please fill in manually or rescan.`);
    }
  } catch (err) {
    setStatus('error', '❌ OCR failed. Please fill in manually.');
    console.error('OCR error:', err);
  }

  isScanning = false;
  document.getElementById('capture-btn').disabled = false;
}

/* ── 12. IMAGE ENHANCEMENT ───────────────────── */
function enhanceForOCR(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    // Greyscale
    const grey = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
    // Increase contrast
    const contrasted = Math.min(255, Math.max(0, (grey - 128) * 1.6 + 128));
    // Threshold — makes text crisply black on white
    const val = contrasted > 140 ? 255 : 0;
    d[i] = d[i+1] = d[i+2] = val;
  }
  ctx.putImageData(imageData, 0, 0);
}

/* ── 13. PARSE LABEL TEXT ────────────────────── */
/*
  Supports formats written on cellotape labels:
    RICE 5KG — 2500
    RICE 5KG 2500
    RICE 5KG: 2500
    RICE 5KG / 2500
    2500 RICE 5KG
    ₦2500 RICE 5KG
*/
function parseLabel(raw) {
  if (!raw) return { name: '', price: '' };

  const text = raw
    .replace(/[₦#]/g, '')         // remove currency symbols
    .replace(/\n+/g, ' ')         // collapse newlines
    .replace(/\s{2,}/g, ' ')      // collapse spaces
    .trim()
    .toUpperCase();

  // Find the first number that looks like a price (≥ 2 digits, may have comma/dot)
  const priceMatch = text.match(/(\d{2,}[,.]?\d*)/);
  if (!priceMatch) return { name: text, price: '' };

  const priceStr = priceMatch[1].replace(',', '');
  const price    = parseFloat(priceStr);

  // Remove price + separator from text to get name
  const separators = /[-—–:\/|]+/g;
  let name = text
    .replace(priceMatch[0], '')
    .replace(separators, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Capitalise properly
  name = name.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { name, price: isNaN(price) ? '' : price };
}

/* ── 14. POPULATE FORM ───────────────────────── */
function populateForm(parsed, confidence) {
  const nameEl  = document.getElementById('item-name');
  const priceEl = document.getElementById('item-price');
  const nameTag  = document.getElementById('name-auto-tag');
  const priceTag = document.getElementById('price-auto-tag');

  if (parsed.name) {
    nameEl.value = parsed.name;
    nameTag.textContent = 'auto-filled';
    document.getElementById('ocr-name-preview').textContent = parsed.name;
  } else {
    nameTag.textContent = '';
    document.getElementById('ocr-name-preview').textContent = '—';
  }

  if (parsed.price !== '') {
    priceEl.value = parsed.price;
    priceTag.textContent = 'auto-filled';
    document.getElementById('ocr-price-preview').textContent = '₦' + parseFloat(parsed.price).toLocaleString('en-NG');
  } else {
    priceTag.textContent = '';
    document.getElementById('ocr-price-preview').textContent = '—';
  }
}

/* ── 15. RESCAN ──────────────────────────────── */
function rescan() {
  document.getElementById('capture-preview').classList.remove('show');
  document.getElementById('video-wrap').style.opacity = '1';
  document.getElementById('ocr-status').classList.remove('show');
  document.getElementById('ocr-confidence').style.display = 'none';
  document.getElementById('name-auto-tag').textContent  = '';
  document.getElementById('price-auto-tag').textContent = '';
  document.getElementById('item-name').value  = '';
  document.getElementById('item-price').value = '';
}

/* ── 16. STATUS + CONFIDENCE HELPERS ────────── */
function setStatus(type, html) {
  const el = document.getElementById('ocr-status');
  el.className = `ocr-status show ${type}`;
  el.innerHTML = html;
}

function showConfidence(pct) {
  const wrap = document.getElementById('ocr-confidence');
  wrap.style.display = 'flex';
  document.getElementById('conf-bar').style.width = pct + '%';
  document.getElementById('conf-label').textContent = `OCR confidence: ${pct}%`;
}

/* ══════════════════════════════════════════════
   ITEMS LIST
   ══════════════════════════════════════════════ */

let items = [];

function addItem() {
  const nameEl  = document.getElementById('item-name');
  const priceEl = document.getElementById('item-price');
  const qtyEl   = document.getElementById('item-qty');
  const name    = nameEl.value.trim();
  const price   = parseFloat(priceEl.value);
  const qty     = parseInt(qtyEl.value) || 1;

  if (!name)              { shake(nameEl);  return; }
  if (isNaN(price) || price < 0) { shake(priceEl); return; }

  items.push({ id: Date.now(), name, price, qty });
  renderItems();

  nameEl.value  = '';
  priceEl.value = '';
  qtyEl.value   = '1';

  // Reset OCR state for next scan
  rescan();
  nameEl.focus();
}

function shake(el) {
  el.style.borderColor = '#cc4444';
  el.style.boxShadow   = '0 0 0 3px rgba(204,68,68,.2)';
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1200);
  el.focus();
}

function removeItem(id) {
  items = items.filter(i => i.id !== id);
  renderItems();
}

function renderItems() {
  const container = document.getElementById('items-container');
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  document.getElementById('total-display').textContent =
    '₦' + total.toLocaleString('en-NG', { minimumFractionDigits: 2 });
  document.getElementById('total-count').textContent =
    count + ' item' + (count !== 1 ? 's' : '');
  document.getElementById('item-count-badge').textContent =
    items.length + ' item' + (items.length !== 1 ? 's' : '');

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No items yet. Scan a good to begin.</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="item-row">
      <div class="item-info">
        <strong>${esc(item.name)}</strong>
        <span>₦${item.price.toLocaleString('en-NG')} × ${item.qty}</span>
      </div>
      <span class="item-price">₦${(item.price * item.qty).toLocaleString('en-NG',{minimumFractionDigits:2})}</span>
      <button class="item-remove" onclick="removeItem(${item.id})" aria-label="Remove">✕</button>
    </div>
  `).join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function clearAll() {
  if (!items.length) return;
  if (confirm('Clear all scanned items?')) { items = []; renderItems(); }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.closest('.form-panel')) addItem();
  if (e.key === 'Escape') { closeReceipt(); closePayment(); }
});

/* ══════════════════════════════════════════════
   RECEIPT MODAL
   ══════════════════════════════════════════════ */
function showReceipt() {
  if (!items.length) { alert('No items yet. Add some items first.'); return; }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('receipt-date').textContent = new Date().toLocaleString('en-NG');
  document.getElementById('receipt-items').innerHTML =
    items.map(item => `
      <div class="receipt-row">
        <span>${esc(item.name)} ×${item.qty}</span>
        <span>₦${(item.price*item.qty).toLocaleString('en-NG',{minimumFractionDigits:2})}</span>
      </div>`).join('') +
    `<div class="receipt-row total-row">
      <span>TOTAL</span>
      <span>₦${total.toLocaleString('en-NG',{minimumFractionDigits:2})}</span>
    </div>`;
  openModal('receipt-modal');
}
function closeReceipt() { closeModal('receipt-modal'); }
document.getElementById('receipt-modal').addEventListener('click', function(e) {
  if (e.target === this) closeReceipt();
});

/* ══════════════════════════════════════════════
   PAYMENT MODAL
   ══════════════════════════════════════════════ */
let currentPlan = '';
function openPayment(plan, price) {
  currentPlan = plan;
  document.getElementById('payment-title').textContent = `Subscribe to ${plan}`;
  document.getElementById('payment-price').textContent = `₦${price} / month`;
  document.getElementById('transfer-amount').textContent = `₦${price}`;
  goStep(1, true);
  openModal('payment-modal');
}
function closePayment() { closeModal('payment-modal'); }
document.getElementById('payment-modal').addEventListener('click', function(e) {
  if (e.target === this) closePayment();
});
function goStep(n, silent) {
  [1,2,3].forEach(i => {
    document.getElementById(`pay-step-${i}`).classList.toggle('active', i === n);
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.remove('active','done');
    if (i < n)  dot.classList.add('done');
    if (i === n) dot.classList.add('active');
  });
  const card = document.querySelector('#payment-modal .modal-card');
  if (card && !silent) card.scrollTop = 0;
}
function copyAcct(btn) {
  const num = '8088669148';
  navigator.clipboard.writeText(num).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = num; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}
function submitPayment() {
  const name  = document.getElementById('pay-name').value.trim();
  const email = document.getElementById('pay-email').value.trim();
  const ref   = document.getElementById('pay-ref').value.trim();
  if (!name)  { shake(document.getElementById('pay-name'));  return; }
  if (!email || !email.includes('@')) { shake(document.getElementById('pay-email')); return; }
  if (!ref)   { shake(document.getElementById('pay-ref'));   return; }
  document.getElementById('success-plan').textContent = currentPlan;
  document.getElementById('success-note').textContent =
    `A confirmation will be sent to ${email} once your transfer is verified.`;
  goStep(3);
}

/* ══════════════════════════════════════════════
   MODAL HELPERS
   ══════════════════════════════════════════════ */
function openModal(id) {
  const overlay = document.getElementById(id);
  overlay.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('active','visible')));
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.remove('visible');
  setTimeout(() => {
    overlay.classList.remove('active');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }, 350);
}
