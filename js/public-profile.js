// js/public-profile.js
import { API_BASE, WEB_BASE, WEB_APP_PATH } from "./config.js";
import { supabase } from "./supabaseClient.js";
let cachedWishlistItems = [];

function capDonationAmountForItem(item, amount) {
  const price = Number(item?.price || 0);

  // current gifted amount (لو donors موجودة نثق فيها)
  let currentDonated = Number(item?.donated || 0);

  let donors = item?.donors || [];
  if (typeof donors === "string") { try { donors = JSON.parse(donors) || []; } catch { donors = []; } }
  if (Array.isArray(donors) && donors.length) {
    currentDonated = donors.reduce((s, d) => s + Number(d?.amount || 0), 0);
  }

  const remain = Math.max(price - currentDonated, 0);
  return Math.min(Number(amount || 0), remain);
}

function clampItemDonatedToPrice(item) {
  const price = Number(item?.price || 0);

  let donors = item?.donors || [];
  if (typeof donors === "string") { try { donors = JSON.parse(donors) || []; } catch { donors = []; } }
  if (!Array.isArray(donors)) donors = [];

  let donatedSum = donors.reduce((s, d) => s + Number(d?.amount || 0), 0);

  if (price > 0 && donatedSum > price) donatedSum = price;

  item.donors = donors;
  item.donated = donatedSum;
  return item;
}

function qp(name){
  return new URL(window.location.href).searchParams.get(name);
}

function safeText(id, v){
  const el = document.getElementById(id);
  if (el) el.textContent = (v ?? "").toString().trim() || "-";
}

function money(n){
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "0";
}

async function fetchUserPublic(userId){
  const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}?populate=*`,{
    headers: {"ngrok-skip-browser-warning":"true"},
  });

  const txt = await res.text();
  let data;
  try{ data = JSON.parse(txt); }catch{ throw new Error("Non-JSON response"); }
  if(!res.ok) throw new Error(data?.error?.message || `Failed: ${res.status}`);

  return (data && data.data) ? data.data : data;
}

function normalizeUser(u){
  if(!u) return null;
  if(u.attributes) return {id:u.id, ...u.attributes};
  return u;
}

function calcTotals(wishlist){
  const list = Array.isArray(wishlist) ? wishlist : [];
  const goal = list.reduce((s,it)=> s + Number(it?.price||0), 0);
  const donated = list.reduce((s,it)=> s + Number(it?.donated||0), 0);
  const remaining = Math.max(goal - donated, 0);
  const pct = goal > 0 ? Math.min((donated/goal)*100, 100) : 0;
  return {goal, donated, remaining, pct};
}

function hashStorageSegment(value = ""){
  let h = 0;
  const s = String(value || "");
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8) || "0";
}

function safeTitle(t){
  const raw = String(t || "wishlist").trim();
  const normalized = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let slug = normalized
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");

  if (!slug) slug = `wishlist_${hashStorageSegment(raw)}`;
  if (/[^A-Za-z0-9 ._-]/.test(normalized)) slug = `${slug}_${hashStorageSegment(raw)}`;
  return slug.slice(0, 90);
}
function safeFileName(original="bill.png"){
  const parts = original.split(".");
  const ext = parts.length>1 ? parts.pop() : "png";
  return `bill_${Date.now()}.${ext}`;
}
async function fileToUint8Array(file){
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function uploadBillToSupabase({ recipientUserId, itemTitle, file }){
  const bytes = await fileToUint8Array(file);
  const title = safeTitle(itemTitle || "wishlist");
  const filename = safeFileName(file.name);

  // ✅ نفس من Flutter: users/{id}/whishList/{title}/itemBills/{fileName}
  const path = `users/${recipientUserId}/whishList/${title}/itemBills/${filename}`;

  const { error } = await supabase.storage
    .from("user-uploads")
    .upload(path, bytes, { upsert:true, contentType: file.type || "image/png" });

  if(error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from("user-uploads").getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if(!publicUrl) throw new Error("Failed to get bill public URL");

  return publicUrl;
}

function normalizeWishlist(raw){
  if(!raw) return [];
  if(typeof raw === "string"){ try{return JSON.parse(raw)||[]}catch{return[]} }
  if(Array.isArray(raw)) return raw;
  return [];
}

function getJwtOrThrow(){
  const jwt = localStorage.getItem("jwt") || localStorage.getItem("token");
  if(!jwt) throw new Error("Please log in to submit your gift.");
  return jwt;
}

async function fetchUserForUpdate(userId, jwt){
  const res = await fetch(`${API_BASE}/api/users/${userId}`,{
    headers:{
      Authorization:`Bearer ${jwt}`,
      "ngrok-skip-browser-warning":"true",
    }
  });
  const text = await res.text();
  let data; try{ data=JSON.parse(text);}catch{ throw new Error("Server returned non-JSON"); }
  if(!res.ok) throw new Error(data?.error?.message || `Failed to fetch user: ${res.status}`);
  return data;
}

async function updateUserWishlist(userId, jwt, wishlist){
  const res = await fetch(`${API_BASE}/api/users/${userId}`,{
    method:"PUT",
    headers:{
      Authorization:`Bearer ${jwt}`,
      "Content-Type":"application/json",
      "ngrok-skip-browser-warning":"true",
    },
    body: JSON.stringify({ wishlist })
  });

  const text = await res.text();
  let data; try{ data=JSON.parse(text);}catch{ throw new Error("Server returned non-JSON"); }
  if(!res.ok) throw new Error(data?.error?.message || `Failed to update user: ${res.status}`);
  return data;
}


async function notifyGiftByEmail({ userId, jwt, itemTitle, donorName, amount, billUrl }){
  // Same idea as GradApp ApiService.addDonation(): email is sent after wishlist update succeeds.
  // Notification failure must not cancel the saved gift.
  try{
    const res = await fetch(`${API_BASE}/api/donations/notify`,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${jwt}`,
        "Content-Type":"application/json",
        "ngrok-skip-browser-warning":"true",
      },
      body: JSON.stringify({
        userId,
        itemTitle,
        donorName,
        amount,
        billUrl,
      })
    });

    if(!res.ok){
      let msg = `Notify failed: ${res.status}`;
      try{
        const data = await res.json();
        msg = data?.error?.message || data?.message || msg;
      }catch{}
      throw new Error(msg);
    }

    return true;
  }catch(err){
    console.warn("Email notification failed (gift saved):", err);
    return false;
  }
}

let tesseractLoadPromise = null;
let receiptOcrState = {
  fileKey: "",
  isReading: false,
  isValidInstaPayReceipt: false,
  donorName: "",
  amount: null,
  rawText: "",
};
let receiptOcrRequestId = 0;

function getFileKey(file){
  if(!file) return "";
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function normalizeArabicDigits(value=""){
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return String(value).replace(/[٠-٩۰-۹]/g, ch => {
    const a = arabic.indexOf(ch);
    if(a >= 0) return String(a);
    const p = persian.indexOf(ch);
    if(p >= 0) return String(p);
    return ch;
  });
}

function parseAmountNumber(raw=""){
  const cleaned = normalizeArabicDigits(raw).replace(/[^0-9]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractReceiptDataFromText(rawText=""){
  const fullText = normalizeArabicDigits(rawText || "");
  const lower = fullText.toLowerCase();

  const isInstaPayReceipt =
    fullText.includes("تمت العملية بنجاح") ||
    lower.includes("instapay") ||
    lower.includes("ipn") ||
    lower.includes("powered by") ||
    fullText.includes("المبلغ المحول") ||
    fullText.includes("المرجع") ||
    fullText.includes("التاريخ");

  const lines = fullText
    .split(/\r?\n/)
    .map(e => e.trim())
    .filter(Boolean);

  let amount = null;

  // Main pattern: 6,300 EGP / 3130 EGP / EGP 500
  const amountPatterns = [
    /(\d{1,3}(?:[,\s]\d{3})+|\d+)\s*(?:EGP|E\.G\.P|جنيه|ج\.م)/i,
    /(?:EGP|E\.G\.P|جنيه|ج\.م)\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)/i,
  ];

  for(const pattern of amountPatterns){
    const match = pattern.exec(fullText);
    if(match){
      amount = parseAmountNumber(match[1] || match[0]);
      if(amount) break;
    }
  }

  // Fallback close to the Flutter app: use the top part before "من" when EGP is badly read.
  if(!amount){
    const topPart = fullText.split("من")[0] || fullText.slice(0, 700);
    const fallbackMatch = /\d{1,3}(?:[,\s]\d{3})+|\d{3,6}/.exec(topPart);
    if(fallbackMatch) amount = parseAmountNumber(fallbackMatch[0]);
  }

  let donorName = "";

  // In InstaPay receipts, sender name usually appears after "من".
  for(let i=0; i<lines.length; i++){
    const line = lines[i];
    if(line === "من" || line.includes("من")){
      for(let j=i+1; j<lines.length && j<=i+4; j++){
        const candidate = lines[j].trim();
        const cLower = candidate.toLowerCase();
        const isBadLine =
          cLower.includes("instapay") ||
          cLower.includes("ipn") ||
          cLower.includes("powered") ||
          cLower.includes("egp") ||
          cLower.includes("successful") ||
          candidate.includes("@") ||
          candidate.includes("إلى") ||
          candidate.includes("الى") ||
          candidate.includes("المبلغ") ||
          candidate.includes("المرجع") ||
          candidate.includes("التاريخ") ||
          candidate.includes("ملاحظة") ||
          /^\d+$/.test(candidate);

        if(!isBadLine && candidate.length >= 3){
          donorName = candidate;
          break;
        }
      }
      if(donorName) break;
    }
  }

  // Fallback: choose the first line that looks like a name.
  if(!donorName){
    donorName = lines.find(line => {
      const l = line.toLowerCase();
      return line.length >= 5 &&
        !l.includes("egp") &&
        !l.includes("instapay") &&
        !l.includes("ipn") &&
        !l.includes("powered") &&
        !l.includes("successful") &&
        !line.includes("@") &&
        !line.includes("تمت") &&
        !line.includes("المبلغ") &&
        !line.includes("من") &&
        !line.includes("إلى") &&
        !line.includes("الى") &&
        !line.includes("المرجع") &&
        !line.includes("التاريخ") &&
        !line.includes("ملاحظة") &&
        !/\d/.test(line);
    }) || "";
  }

  return {
    isInstaPayReceipt,
    donorName: donorName.trim(),
    amount,
    rawText: fullText,
  };
}

function setOcrMessage(message, type=""){
  const el = document.getElementById("receiptOcrMsg");
  if(!el) return;
  el.textContent = message || "";
  el.className = `receipt-ocr-msg ${type}`.trim();
}

function setButtonLoadingState(button, isLoading, label){
  if(!button) return;
  const text = button.querySelector(".btn-text");
  const spinner = button.querySelector(".spinner");
  button.disabled = !!isLoading;
  button.classList.toggle("is-loading", !!isLoading);
  if(spinner) spinner.style.display = isLoading ? "inline-block" : "none";
  if(text && label) text.textContent = label;
}

function loadTesseract(){
  if(window.Tesseract?.recognize) return Promise.resolve(window.Tesseract);
  if(tesseractLoadPromise) return tesseractLoadPromise;

  tesseractLoadPromise = new Promise((resolve, reject)=>{
    const existing = document.querySelector('script[data-weddwish-tesseract="1"]');
    if(existing){
      existing.addEventListener("load", ()=>resolve(window.Tesseract), { once:true });
      existing.addEventListener("error", ()=>reject(new Error("Failed to load OCR library")), { once:true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.defer = true;
    script.dataset.weddwishTesseract = "1";
    script.onload = () => window.Tesseract?.recognize ? resolve(window.Tesseract) : reject(new Error("OCR library is unavailable"));
    script.onerror = () => reject(new Error("Failed to load OCR library"));
    document.head.appendChild(script);
  });

  return tesseractLoadPromise;
}

async function runReceiptOcr(file, { nameIn, amountIn, submitBtn } = {}){
  const requestId = ++receiptOcrRequestId;
  const fileKey = getFileKey(file);

  receiptOcrState = {
    fileKey,
    isReading: true,
    isValidInstaPayReceipt: false,
    donorName: "",
    amount: null,
    rawText: "",
  };

  setButtonLoadingState(submitBtn, true, "Reading receipt...");
  setOcrMessage("Reading receipt with OCR... 0%", "reading");

  try{
    const Tesseract = await loadTesseract();

    const result = await Tesseract.recognize(file, "eng+ara", {
      logger: m => {
        if(requestId !== receiptOcrRequestId) return;
        if(m?.status === "recognizing text" && typeof m.progress === "number"){
          setOcrMessage(`Reading receipt with OCR... ${Math.round(m.progress * 100)}%`, "reading");
        }
      }
    });

    if(requestId !== receiptOcrRequestId) return;

    const parsed = extractReceiptDataFromText(result?.data?.text || "");

    receiptOcrState = {
      fileKey,
      isReading: false,
      isValidInstaPayReceipt: !!parsed.isInstaPayReceipt,
      donorName: parsed.donorName || "",
      amount: parsed.amount || null,
      rawText: parsed.rawText || "",
    };

    if(parsed.donorName && nameIn && !nameIn.value.trim()) nameIn.value = parsed.donorName;
    if(parsed.amount && amountIn) amountIn.value = String(parsed.amount);

    if(parsed.isInstaPayReceipt){
      setOcrMessage("InstaPay receipt detected ✅ Details were filled automatically. Please review before submitting.", "success");
    }else{
      setOcrMessage("This image does not look like an InstaPay receipt ❌ Please upload a valid InstaPay receipt.", "error");
    }
  }catch(err){
    if(requestId !== receiptOcrRequestId) return;
    console.error("OCR failed:", err);
    receiptOcrState = {
      fileKey,
      isReading: false,
      isValidInstaPayReceipt: false,
      donorName: "",
      amount: null,
      rawText: "",
    };
    setOcrMessage("Failed to read the receipt. Please upload a clearer InstaPay receipt.", "error");
  }finally{
    if(requestId === receiptOcrRequestId) setButtonLoadingState(submitBtn, false, "Submit gift");
  }
}

function validateReceiptOcrOrThrow(file){
  const fileKey = getFileKey(file);
  if(receiptOcrState.isReading && receiptOcrState.fileKey === fileKey){
    throw new Error("Please wait until OCR finishes reading the receipt.");
  }
  if(receiptOcrState.fileKey !== fileKey){
    throw new Error("Please wait for the receipt OCR check to finish.");
  }
  if(!receiptOcrState.isValidInstaPayReceipt){
    throw new Error("Please upload a valid InstaPay receipt.");
  }
}

function renderWishlist(grid, wishlist) {
  grid.innerHTML = "";
  const list = Array.isArray(wishlist) ? wishlist : [];

  if (!list.length) {
    grid.innerHTML = `<div style="color:white;opacity:.85;text-align:center;width:100%;padding:20px;">No wishlist items.</div>`;
    return;
  }

  for (const item of list) {
    const donated = Number(item?.donated || 0);
    const price = Number(item?.price || 0);

    const isFunded = price > 0 && donated >= price;
    const displayDonated = isFunded ? price : donated; // عشان يبقى 1000/1000 مش 1200/1000 لو حصل overflow
    const remain = Math.max(price - donated, 0);

    const pct = price > 0 ? Math.min((donated / price) * 100, 100) : 0;

    const title = item?.title || "Item";
    const img = item?.image || "images/placeholder.webp";

const rawUrl = (item?.url || "").toString().trim();
const cleanedUrl = /example\.com/i.test(rawUrl) ? "" : rawUrl;  // ✅ اعتبر example.com كأنه مفيش لينك
const hasUrl = !!cleanedUrl;
const encodedUrl = encodeURIComponent(cleanedUrl);
grid.innerHTML += `
  <div class="wishlist-card ${isFunded ? "funded" : ""}">
    
    <!-- ✅ clickable image -->
    <button type="button"
  class="${hasUrl ? "item-open" : "disabled-open"}"
  ${hasUrl ? `data-url="${encodedUrl}"` : ""}>
  <img src="${img}" alt="${title}">
</button>

    <div class="item-info">

      <!-- ✅ clickable title -->
      <button type="button"
  class="item-title-btn ${hasUrl ? "item-open" : "disabled-open"}"
  ${hasUrl ? `data-url="${encodedUrl}"` : ""}>
  ${title}
  ${hasUrl ? `<i class="fa fa-external-link"></i>` : ``}
</button>

      

      <p class="item-price">${price} EGP goal</p>

      <div class="donation-progress">
        <div class="donation-progress-fill" style="width:${pct}%"></div>
      </div>

      <span class="donation-progress-text">${displayDonated} / ${price}</span>

      ${
        isFunded
          ? `<div class="funded-badge">Fully Gifted 🎉</div>`
          : `
            <button
              class="public-donate-btn donate-item-btn"
              type="button"
              data-title="${encodeURIComponent(title)}"
              data-remain="${remain}"
              style="margin-top:10px;width:100%;"
            >
              Gift this item
            </button>
          `
      }
    </div>
  </div>
`;
  }
}


//function setupShare(){
//  const btn = document.getElementById("share-profile-btn");
//  if(!btn) return;
//  btn.addEventListener("click", async ()=>{
//    const url = window.location.href;
//    try{
//      if(navigator.share){
//        await navigator.share({title:"WeddWish Profile", url});
//      }else if(navigator.clipboard?.writeText){
//        await navigator.clipboard.writeText(url);
//        alert("Link copied ✅");
//      }else{
//        prompt("Copy this link:", url);
//      }
//    }catch(e){
//      console.error(e);
//      alert("Share failed");
//    }
//  });
//}
function buildPublicProfileLink(userId){
  return `${WEB_BASE}${WEB_APP_PATH}/public-profile.html?id=${encodeURIComponent(userId)}`;
}

function setupShare(){
  const btn = document.getElementById("share-profile-btn");
  if(!btn) return;

  // منع تكرار الربط
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async ()=>{
    const userId = qp("id");
    const url = buildPublicProfileLink(userId);

    try{
      if(navigator.share){
        await navigator.share({title:"WeddWish Profile", url});
      }else if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(url);
        alert("Link copied ✅");
      }else{
        prompt("Copy this link:", url);
      }
    }catch(e){
      console.error(e);
      alert("Share failed");
    }
  });
}


function setupCopyInstapay(){
  const btn = document.getElementById("copyInstapayBtn");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    const val = document.getElementById("publicInstapay")?.textContent?.trim();
    if(!val || val === "-") return;
    try{
      await navigator.clipboard.writeText(val);
      alert("Copied ✅");
    }catch{
      prompt("Copy:", val);
    }
  });
}

let activeInstaPayProfileLink = "";
let paymentReturnTimer = null;

function getValidInstaPayLink(){
  const link = String(activeInstaPayProfileLink || "").trim();
  if(!link) return "";
  try{
    const uri = new URL(link);
    return uri.protocol ? link : "";
  }catch{
    return "";
  }
}

function showPaymentMessage(message, isError=false){
  const status = document.getElementById("publicStatus");
  if(!status) return;
  status.textContent = message || "";
  status.style.color = isError ? "#ffb3b3" : "white";
}

function savePendingDonationContext(){
  try{
    sessionStorage.setItem("weddwish_pending_donation", JSON.stringify({
      profileId: qp("id"),
      context: donationContext,
      createdAt: Date.now(),
    }));
  }catch{}
}

function clearPendingDonationContext(){
  try{ sessionStorage.removeItem("weddwish_pending_donation"); }catch{}
}

function openInstaPayLink(link){
  // Open in a new tab/app so the public profile stays alive and can show the receipt form.
  const opened = window.open(link, "_blank");
  if(opened){
    try{ opened.opener = null; }catch{}
    return true;
  }
  return false;
}

function openDonationFormAfterPayment(){
  if(paymentReturnTimer) clearTimeout(paymentReturnTimer);

  paymentReturnTimer = setTimeout(() => {
    clearPendingDonationContext();
    showPaymentMessage("");
    openDonationForm();
  }, 900);
}

function startInstaPayThenReceiptForm(){
  const link = getValidInstaPayLink();

  if(!link){
    showPaymentMessage("This profile does not have a valid InstaPay profile link.", true);
    return;
  }

  savePendingDonationContext();

  const opened = openInstaPayLink(link);

  if(!opened){
    showPaymentMessage("If InstaPay did not open automatically, press Pay with InstaPay.", false);
    if(typeof window.openPaymentStepModal === "function") window.openPaymentStepModal();
    return;
  }

  showPaymentMessage("InstaPay opened. After you pay, return here and upload the receipt.", false);

  // On mobile, JS timers usually continue when the user returns from the payment app.
  // On desktop, the form opens on the current page while InstaPay is in another tab.
  openDonationFormAfterPayment();
}

function setWwModalOpenState(){
  const anyOpen = Array.from(document.querySelectorAll('.ww-modal')).some(m => getComputedStyle(m).display !== 'none');
  document.body.classList.toggle('ww-modal-open', anyOpen);
}

function showWwModal(modal){
  if(!modal) return;
  modal.style.display = 'flex';
  document.body.classList.add('ww-modal-open');
  const card = modal.querySelector('.ww-modal-card');
  if(card) card.scrollTop = 0;
}

function hideWwModal(modal){
  if(!modal) return;
  modal.style.display = 'none';
  setWwModalOpenState();
}

function setupPaymentStepModal(){
  const modal = document.getElementById("paymentStepModal");
  const closeBtn = document.getElementById("closePaymentStepModal");
  const payBtn = document.getElementById("payWithInstaPayBtn");
  const continueBtn = document.getElementById("continueToReceiptBtn");
  const titleEl = document.getElementById("paymentStepTitle");
  const targetEl = document.getElementById("paymentStepTarget");

  if(!modal) return;

  const close = () => { hideWwModal(modal); };
  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });

  payBtn?.addEventListener("click", ()=>{
    startInstaPayThenReceiptForm();
  });

  continueBtn?.addEventListener("click", ()=>{
    close();
    openDonationForm();
  });

  window.openPaymentStepModal = () => {
    const ctx = donationContext || {};
    if(titleEl){
      titleEl.textContent = ctx.type === "item" && ctx.itemTitle
        ? `Gift to ${ctx.itemTitle}`
        : "Gift to wishlist";
    }
    if(targetEl){
      targetEl.textContent = "بعد ما تبعت الهدية ارجع وارفع صورة الإيصال. اضغط للانتقال إلى InstaPay";
      targetEl.setAttribute("dir", "rtl");
    }
    showWwModal(modal);
  };
}

function setupDonateFlow(instaPayProfileLink){
  activeInstaPayProfileLink = String(instaPayProfileLink || "").trim();

  const wishlistBtn = document.getElementById("donateWishlistBtn");
  if(wishlistBtn && wishlistBtn.dataset.paymentBound !== "1"){
    wishlistBtn.dataset.paymentBound = "1";
    wishlistBtn.addEventListener("click", ()=>{
      setDonationContext({ type:"wishlist" });
      if(typeof window.openPaymentStepModal === "function") window.openPaymentStepModal();
      else startInstaPayThenReceiptForm();
    });
  }

  // Donate to specific item (event delegation)
  const grid = document.getElementById("wishlistGrid") || document;
  if(grid.dataset.paymentBound !== "1"){
    grid.dataset.paymentBound = "1";
    grid.addEventListener("click", (e)=>{
      const btn = e.target.closest(".donate-item-btn");
      if(!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const title = decodeURIComponent(btn.dataset.title || "");
      const remain = Number(btn.dataset.remain || 0);

      setDonationContext({ type:"item", itemTitle:title, remain });
      if(typeof window.openPaymentStepModal === "function") window.openPaymentStepModal();
      else startInstaPayThenReceiptForm();
    });
  }

  setupPaymentStepModal();
}

function restorePendingDonationContextIfNeeded(){
  try{
    const raw = sessionStorage.getItem("weddwish_pending_donation");
    if(!raw) return;

    const saved = JSON.parse(raw);
    const sameProfile = String(saved?.profileId || "") === String(qp("id") || "");
    const freshEnough = Date.now() - Number(saved?.createdAt || 0) < 20 * 60 * 1000;

    if(sameProfile && freshEnough && saved?.context){
      setDonationContext(saved.context);
      clearPendingDonationContext();
      openDonationForm();
    }
  }catch{}
}

let donationContext = null; // { type:'item'|'wishlist'|'manual', itemTitle?, remain? }

function setDonationContext(ctx){ donationContext = ctx; }

(async function init(){
  setupShare();
  setupCopyInstapay();

  const status = document.getElementById("publicStatus");
  const grid = document.getElementById("wishlistGrid");
  const selfBanner = document.getElementById("selfBanner");
  const donateBtn = document.getElementById("donateWishlistBtn");
  const directFormBtn = document.getElementById("openDonateFormBtn");

  const userId = qp("id");
  if(!userId){
    if(status) status.textContent = "Missing id";
    return;
  }

  if(status) status.textContent = "Loading...";

  try{
    const u = normalizeUser(await fetchUserPublic(userId));
    /*const wishlistArr = normalizeWishlist(u?.wishlist);
    cachedWishlistTitles = wishlistArr.map(it => it?.title).filter(Boolean);*/
    cachedWishlistItems = normalizeWishlist(u?.wishlist).map(clampItemDonatedToPrice);





    safeText("publicName", u?.username || u?.name || "Profile");
    safeText("wishlistTitle", `${u?.username || u?.name || "User"}'s Wishlist`);

    const instapay = u?.instaPayNumber || u?.instapayNumber || u?.instapay || u?.wallet || "-";
    const instaPayProfileLink =
      u?.instaPayProfileLink ||
      u?.instapayProfileLink ||
      u?.instaPayLink ||
      u?.instapayLink ||
      "";
    safeText("publicInstapay", instaPayProfileLink || instapay);

    const publicAvatar = document.getElementById("publicAvatar");
    const defaultAvatar = "images/profile.jpeg";
    const avatar = u?.profileImageURL || u?.profileImageUrl || u?.avatar || u?.image;
    if (publicAvatar) {
      publicAvatar.onerror = () => { publicAvatar.onerror = null; publicAvatar.src = defaultAvatar; };
      publicAvatar.src = avatar || defaultAvatar;
    }

    // totals
    const {goal, donated, remaining, pct} = calcTotals(u?.wishlist);
    safeText("totalGoal", money(goal));
    safeText("totalDonated", money(donated));
    safeText("totalRemaining", money(remaining));
    const fill = document.getElementById("totalProgressFill");
    if(fill) fill.style.width = `${pct}%`;
    safeText("totalProgressText", `${Math.round(pct)}%`);

    // render wishlist
    if (grid) {
  renderWishlist(grid, u?.wishlist);
  bindPublicWishlistLinks();
}


    // منع التبرع لنفسك
    const me = (()=>{ try{return JSON.parse(localStorage.getItem("user")||"{}");}catch{return {};} })();
    const myId = me?.id;
    if (myId && String(myId) === String(u?.id)) {
      document.querySelectorAll(".donate-item-btn").forEach(b => b.style.display = "none");
    }

    if(myId && String(myId) === String(u?.id)){
      if(selfBanner) selfBanner.style.display = "flex";
      if(donateBtn) donateBtn.style.display = "none";
      if(directFormBtn) directFormBtn.style.display = "none";
    }else{
      if(selfBanner) selfBanner.style.display = "none";
      if(donateBtn) donateBtn.style.display = "";
      if(directFormBtn) directFormBtn.style.display = "";
    }

    // payment flow
    setupDonateFlow(instaPayProfileLink);
    setupDonationFormHandlers();
    restorePendingDonationContextIfNeeded();


    if(status) status.textContent = "";
  }catch(e){
    console.error(e);
    if(status) status.textContent = "Failed to load profile";
  }
})();

function openDonationForm(){
  const formModal = document.getElementById("donationFormModal");
  const ctxText = document.getElementById("donationContextText");
  const targetChooser = document.getElementById("targetChooser");
  const itemSelect = document.getElementById("itemSelect");

  // reset chooser
  if(donationContext?.type === "manual"){
    if(targetChooser) targetChooser.style.display = "block";
    if(ctxText) ctxText.textContent = "Submit your gift receipt (choose target).";
  } else if(donationContext?.type === "item"){
    if(targetChooser) targetChooser.style.display = "none";
    if(ctxText) ctxText.textContent = `For: ${donationContext.itemTitle} (Left to complete: ${donationContext.remain} EGP)`;
  } else {
    if(targetChooser) targetChooser.style.display = "none";
    if(ctxText) ctxText.textContent = "Gift to wishlist";
  }

  // ✅ fill item select (exclude fully gifted)
  if (itemSelect) {
    itemSelect.innerHTML = "";

    const available = (cachedWishlistItems || [])
      .map(it => {
        const title = (it?.title || "").trim();
        const price = Number(it?.price || 0);
        const donated = Number(it?.donated || 0);
        const remain = Math.max(price - donated, 0);
        return { title, remain };
      })
      .filter(x => x.title && x.remain > 0);

    if (!available.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No items available (all gifted)";
      itemSelect.appendChild(opt);
      itemSelect.disabled = true;
    } else {
      itemSelect.disabled = false;
      for (const x of available) {
        const opt = document.createElement("option");
        opt.value = x.title;
        opt.textContent = `${x.title} (Left to complete: ${x.remain} EGP)`;
        itemSelect.appendChild(opt);
      }
    }

    // show/hide based on radio
    const checked = formModal?.querySelector('input[name="donationTarget"]:checked');
    const choice = checked?.value || "wishlist";
    itemSelect.style.display = (choice === "item") ? "block" : "none";
  }

  if(formModal){
    const paymentModal = document.getElementById("paymentStepModal");
    hideWwModal(paymentModal);
    showWwModal(formModal);
  }
}


function setupDonationFormHandlers(){
  const formModal = document.getElementById("donationFormModal");
  const closeBtn = document.getElementById("closeDonationForm");
  const cancelBtn = document.getElementById("cancelDonationBtn");
  const submitBtn = document.getElementById("submitDonationBtn");
  const submitBtnText = submitBtn?.querySelector(".btn-text");
  const submitSpinner = submitBtn?.querySelector(".spinner");
  const openDirectBtn = document.getElementById("openDonateFormBtn");

  const msgEl = document.getElementById("donationFormMsg");
  const fileIn = document.getElementById("receiptFile");
  const preview = document.getElementById("receiptPreview");

  const nameIn = document.getElementById("donorName");
  const amountIn = document.getElementById("donationAmount");
  const emailIn = document.getElementById("donorEmail");

  const targetChooser = document.getElementById("targetChooser");
  const itemSelect = document.getElementById("itemSelect");

  if(!formModal || !submitBtn) return;

  function setSubmitGiftLoading(isLoading, label = "Submit gift"){
    submitBtn.disabled = !!isLoading;
    submitBtn.classList.toggle("is-loading", !!isLoading);
    if(submitSpinner) submitSpinner.style.display = isLoading ? "inline-block" : "none";
    if(submitBtnText) submitBtnText.textContent = label;
  }

  // open direct (manual) - optional button; it may be disabled/commented in HTML
  openDirectBtn?.addEventListener("click", ()=>{
    setDonationContext({ type:"manual" });
    openDonationForm();
  });

  // show item select when choose item
  formModal.addEventListener("change",(e)=>{
    if(e.target?.name === "donationTarget"){
      const v = e.target.value;
      if(itemSelect) itemSelect.style.display = (v==="item") ? "block" : "none";
    }
  });

  // preview + OCR validation/extraction (same idea as GradApp payment_form.dart)
  fileIn?.addEventListener("change", ()=>{
    if(msgEl) msgEl.textContent = "";
    setSubmitGiftLoading(false, "Submit gift");
    const f = fileIn.files?.[0];

    receiptOcrRequestId++;
    receiptOcrState = {
      fileKey: "",
      isReading: false,
      isValidInstaPayReceipt: false,
      donorName: "",
      amount: null,
      rawText: "",
    };

    if(!f){
      if(preview) preview.style.display="none";
      setOcrMessage("", "");
      return;
    }

    if(preview){
      preview.src = URL.createObjectURL(f);
      preview.style.display = "block";
    }

    runReceiptOcr(f, { nameIn, amountIn, submitBtn });
  });

  const closeAll = ()=>{
    hideWwModal(formModal);
    if(msgEl) msgEl.textContent = "";
    setSubmitGiftLoading(false, "Submit gift");
  };
  closeBtn?.addEventListener("click", closeAll);
  cancelBtn?.addEventListener("click", closeAll);
  formModal.addEventListener("click", (e)=>{ if(e.target === formModal) closeAll(); });

  // submit -> upload supabase -> update strapi wishlist
  submitBtn.addEventListener("click", async ()=>{
    try{
      if(msgEl) msgEl.textContent = "";
      setSubmitGiftLoading(true, "Checking receipt...");

      const donorName = (nameIn?.value||"").trim();
      const amount = Number(amountIn?.value||0);
      const donorEmail = (emailIn?.value||"").trim();
      const receipt = fileIn?.files?.[0];

      if(!donorName) throw new Error("Name is required.");
      if(!amount || amount < 1) throw new Error("Amount must be >= 1.");
      if(!receipt) throw new Error("Receipt image is required.");
      validateReceiptOcrOrThrow(receipt);

      // recipient = profile id
      const recipientUserId = qp("id");
      if(!recipientUserId) throw new Error("Missing recipient id.");

      // must login (jwt)
      const jwt = getJwtOrThrow();

      // determine target
      let targetType = donationContext?.type;      // item|wishlist|manual
      let itemTitle = donationContext?.itemTitle || "";

      if(targetType === "manual"){
        const checked = formModal.querySelector('input[name="donationTarget"]:checked');
        const choice = checked?.value || "wishlist";
        targetType = choice;
        if(choice === "item"){
          itemTitle = itemSelect?.value || "";
          if(!itemTitle) throw new Error("Please select an item.");
        } else {
          itemTitle = "wishlist";
        }
      } else if(targetType === "wishlist"){
        itemTitle = "wishlist";
      }

      let savedGiftAmount = amount;
      let savedGiftItemTitle = itemTitle || "wishlist";

      if(msgEl) msgEl.textContent = "Uploading receipt...";
      setSubmitGiftLoading(true, "Uploading receipt...");

      // upload bill to supabase under recipient folder
      const billUrl = await uploadBillToSupabase({
        recipientUserId,
        itemTitle: (targetType === "item" ? itemTitle : "wishlist"),
        file: receipt,
      });

      if(msgEl) msgEl.textContent = "Updating wishlist...";
      setSubmitGiftLoading(true, "Saving gift...");

      // fetch recipient user (auth) -> parse wishlist -> update -> PUT
      const userData = await fetchUserForUpdate(recipientUserId, jwt);
      const rawWishlist = userData?.wishlist ?? userData?.data?.wishlist; // احتياطي
      const wishlist = normalizeWishlist(rawWishlist);

      // apply gift like Flutter addDonation()
      if(targetType === "item"){
        const idx = wishlist.findIndex(it => String(it?.title||"").trim() === String(itemTitle).trim());
        if(idx === -1) throw new Error("Item not found in wishlist.");

        const it = wishlist[idx];
        let donors = it?.donors || [];
        if(typeof donors === "string"){ try{ donors = JSON.parse(donors)||[] }catch{ donors=[] } }
        if(!Array.isArray(donors)) donors = [];

// ✅ Cap amount before pushing (prevents 29000 on 25000)
        const cappedAmount = capDonationAmountForItem(it, amount);
        if (cappedAmount <= 0) throw new Error("This item is already fully gifted.");
        savedGiftAmount = cappedAmount;
        savedGiftItemTitle = itemTitle;

        donors.push({
          name: donorName,
          amount: cappedAmount,
          bill: billUrl,
          email: donorEmail || undefined
        });

        it.donors = donors;

// ✅ Clamp donated after sum (extra safety)
clampItemDonatedToPrice(it);


        wishlist[idx] = it;
      } else {
        // Wishlist gift (prototype backend): وزّع على أقرب items للإغلاق
        let remaining = amount;
        savedGiftItemTitle = "wishlist";

        const items = wishlist
          .map(it => ({ it, need: Math.max(Number(it?.price||0) - Number(it?.donated||0), 0) }))
          .filter(x => x.need > 0)
          .sort((a,b)=> a.need - b.need);

        for(const x of items){
          if(remaining <= 0) break;
          const part = Math.min(x.need, remaining);
          remaining -= part;

          let donors = x.it?.donors || [];
          if(typeof donors === "string"){ try{ donors = JSON.parse(donors)||[] }catch{ donors=[] } }
          if(!Array.isArray(donors)) donors = [];

          donors.push({ name: donorName, amount: part, bill: billUrl, email: donorEmail || undefined, type:"wishlist" });

          // update gifted amount
          x.it.donors = donors;

          // ✅ Clamp donated after sum (in case old data already overflowed)
          clampItemDonatedToPrice(x.it);
        }
      }

      await updateUserWishlist(recipientUserId, jwt, wishlist);

      if(msgEl) msgEl.textContent = "Sending email notification...";
      setSubmitGiftLoading(true, "Sending email...");
      const emailSent = await notifyGiftByEmail({
        userId: recipientUserId,
        jwt,
        itemTitle: savedGiftItemTitle,
        donorName,
        amount: savedGiftAmount,
        billUrl,
      });

      setSubmitGiftLoading(true, "Done");
      if(msgEl) msgEl.textContent = emailSent
        ? "✅ Gift submitted and email notification sent!"
        : "✅ Gift submitted! Email notification could not be sent.";

      // refresh UI by reloading public user
      setTimeout(()=>{ hideWwModal(formModal); window.location.reload(); }, 600);

    }catch(err){
      console.error(err);
      if(msgEl) msgEl.textContent = err?.message || "Submit failed";
      setSubmitGiftLoading(false, "Submit gift");
    }
  });
}

function normalizeHttpUrl(raw) {
  let u = String(raw ?? "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^www\./i.test(u) || (u.includes(".") && !u.includes(" "))) return `https://${u}`;
  return "";
}

function openItemUrl(rawUrl) {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) return;      // ✅ Public: مفيش رسالة
  window.open(url, "_blank", "noopener");
}


function bindPublicWishlistLinks() {
  const grid = document.getElementById("wishlistGrid");
  if (!grid || grid.dataset.linksBound === "1") return;
  grid.dataset.linksBound = "1";

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".item-open");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    let raw = "";
    try { raw = decodeURIComponent(btn.dataset.url || ""); } catch { raw = btn.dataset.url || ""; }
    if (!raw) return;
    openItemUrl(raw);
      
  });
}
