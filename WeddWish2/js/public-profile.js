// js/public-profile.js
import { API_BASE, WEB_BASE, WEB_APP_PATH } from "./config.js";
import { supabase } from "./supabaseClient.js";
let cachedWishlistItems = [];

function capDonationAmountForItem(item, amount) {
  const price = Number(item?.price || 0);

  // donated الحالي (لو donors موجودة نثق فيها)
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

function safeTitle(t){ return (t||"").trim().replaceAll(" ", "_"); }
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
  if(!jwt) throw new Error("Please login to submit donation.");
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
    const img = item?.image || "images/placeholder.png";

    grid.innerHTML += `
      <div class="wishlist-card ${isFunded ? "funded" : ""}">
        <img src="${img}" alt="${title}">
        <div class="item-info">
          <h3>${title}</h3>

          <p class="item-price">${price} EGP goal</p>

          <div class="donation-progress">
            <div class="donation-progress-fill" style="width:${pct}%"></div>
          </div>

          <span class="donation-progress-text">${displayDonated} / ${price}</span>

          ${
            isFunded
              ? `<div class="funded-badge">Fully Funded 🎉</div>`
              : `
                <button
                  class="public-donate-btn"
                  type="button"
                  data-title="${encodeURIComponent(title)}"
                  data-remain="${remain}"
                  style="margin-top:10px;width:100%;"
                >
                  Donate to this item
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

function setupDonateModal(instapayNumber){
  
  const openBtn = document.getElementById("donateWishlistBtn");
  const modal = document.getElementById("donateModal");
  const closeBtn = document.getElementById("closeDonateModal");
  const qrImg = document.getElementById("methodQr");
  const textEl = document.getElementById("methodText");
  const donateForEl = document.getElementById("donateFor");

  if(!openBtn || !modal || !closeBtn || !qrImg || !textEl) return;

  const titleEl = document.getElementById("methodTitle");

const setMethod = (method) => {
  const map = {
    // ✅ حط هنا path صورة الـ instapay اللي عندك بالظبط
    instapay: {
      img: "images/QrCodes/InstaPay.png",   // <— غيّرها لمسارك الحقيقي
      title: "Scan InstaPay QR",
      text: `InstaPay: ${instapayNumber || "-"}`
    },
    vodafone: {
      img: "images/QrCodes/VodafoneCash.png",
      title: "Scan Vodafone Cash QR",
      text: "Vodafone Cash"
    },
    fawry: {
      img: "images/QrCodes/Fawry.png",
      title: "Scan Fawry QR",
      text: "Fawry"
    },
    etisalat: {
      img: "images/qr-etisalat.png",
      title: "Scan Etisalat Cash QR",
      text: "Etisalat Cash"
    },
  };

  const x = map[method] || map.instapay;

  if (titleEl) titleEl.textContent = x.title;
  qrImg.src = x.img;
  textEl.textContent = x.text;
};

  // default
  setMethod("instapay");
  // ✅ Donate to wishlist (clear item label)
openBtn.addEventListener("click", ()=>{
  setDonationContext({ type:"wishlist" });
  if(donateForEl) donateForEl.textContent = "";
  modal.style.display="flex";
});


// ✅ Donate to specific item (event delegation)
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".donate-item-btn");
  if(!btn) return;

  const title = decodeURIComponent(btn.dataset.title || "");
  const remain = Number(btn.dataset.remain || 0);

  setDonationContext({ type:"item", itemTitle:title, remain });
  if(donateForEl) donateForEl.textContent = `For: ${title} (Remaining: ${remain} EGP)`;

  setMethod("instapay");
  modal.style.display="flex";
});


  
  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
    if (donateForEl) donateForEl.textContent = "";
  });
  function closeQrAndOpenForm(){
  modal.style.display="none";
  openDonationForm(); // هنضيفها تحت
}

closeBtn.addEventListener("click", closeQrAndOpenForm);

modal.addEventListener("click",(e)=>{
  if(e.target === modal) closeQrAndOpenForm();
});


  modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
    if (donateForEl) donateForEl.textContent = "";
  }
});

  modal.querySelectorAll(".ww-method-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      setMethod(btn.dataset.method);
    });
  });
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
    safeText("publicInstapay", instapay);

    const avatar = u?.profileImageURL || u?.profileImageUrl || u?.avatar || u?.image;
    if(avatar) {
      const img = document.getElementById("publicAvatar");
      if(img) img.src = avatar;
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
    if(grid) renderWishlist(grid, u?.wishlist);

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

    // modal
    setupDonateModal(instapay);
    setupDonationFormHandlers();


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
    if(ctxText) ctxText.textContent = "Submit your receipt (choose target).";
  } else if(donationContext?.type === "item"){
    if(targetChooser) targetChooser.style.display = "none";
    if(ctxText) ctxText.textContent = `For: ${donationContext.itemTitle} (Remaining: ${donationContext.remain} EGP)`;
  } else {
    if(targetChooser) targetChooser.style.display = "none";
    if(ctxText) ctxText.textContent = "Donation to wishlist";
  }

  // ✅ fill item select (exclude fully funded)
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
      opt.textContent = "No items available (all funded)";
      itemSelect.appendChild(opt);
      itemSelect.disabled = true;
    } else {
      itemSelect.disabled = false;
      for (const x of available) {
        const opt = document.createElement("option");
        opt.value = x.title;
        opt.textContent = `${x.title} (Remaining: ${x.remain} EGP)`;
        itemSelect.appendChild(opt);
      }
    }

    // show/hide based on radio
    const checked = formModal?.querySelector('input[name="donationTarget"]:checked');
    const choice = checked?.value || "wishlist";
    itemSelect.style.display = (choice === "item") ? "block" : "none";
  }

  if(formModal) formModal.style.display = "flex";
}


function setupDonationFormHandlers(){
  const formModal = document.getElementById("donationFormModal");
  const closeBtn = document.getElementById("closeDonationForm");
  const cancelBtn = document.getElementById("cancelDonationBtn");
  const submitBtn = document.getElementById("submitDonationBtn");
  const openDirectBtn = document.getElementById("openDonateFormBtn");

  const msgEl = document.getElementById("donationFormMsg");
  const fileIn = document.getElementById("receiptFile");
  const preview = document.getElementById("receiptPreview");

  const nameIn = document.getElementById("donorName");
  const amountIn = document.getElementById("donationAmount");
  const emailIn = document.getElementById("donorEmail");

  const targetChooser = document.getElementById("targetChooser");
  const itemSelect = document.getElementById("itemSelect");

  if(!formModal || !submitBtn || !openDirectBtn) return;

  // open direct (manual)
  openDirectBtn.addEventListener("click", ()=>{
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

  // preview
  fileIn?.addEventListener("change", ()=>{
    msgEl.textContent = "";
    const f = fileIn.files?.[0];
    if(!f){ preview.style.display="none"; return; }
    preview.src = URL.createObjectURL(f);
    preview.style.display = "block";
  });

  const closeAll = ()=>{
    formModal.style.display="none";
    if(msgEl) msgEl.textContent = "";
  };
  closeBtn?.addEventListener("click", closeAll);
  cancelBtn?.addEventListener("click", closeAll);

  // submit -> upload supabase -> update strapi wishlist
  submitBtn.addEventListener("click", async ()=>{
    try{
      if(msgEl) msgEl.textContent = "";

      const donorName = (nameIn?.value||"").trim();
      const amount = Number(amountIn?.value||0);
      const donorEmail = (emailIn?.value||"").trim();
      const receipt = fileIn?.files?.[0];

      if(!donorName) throw new Error("Name is required.");
      if(!amount || amount < 1) throw new Error("Amount must be >= 1.");
      if(!receipt) throw new Error("Receipt image is required.");

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

      if(msgEl) msgEl.textContent = "Uploading receipt...";

      // upload bill to supabase under recipient folder
      const billUrl = await uploadBillToSupabase({
        recipientUserId,
        itemTitle: (targetType === "item" ? itemTitle : "wishlist"),
        file: receipt,
      });

      if(msgEl) msgEl.textContent = "Updating wishlist...";

      // fetch recipient user (auth) -> parse wishlist -> update -> PUT
      const userData = await fetchUserForUpdate(recipientUserId, jwt);
      const rawWishlist = userData?.wishlist ?? userData?.data?.wishlist; // احتياطي
      const wishlist = normalizeWishlist(rawWishlist);

      // apply donation like Flutter addDonation()
      if(targetType === "item"){
        const idx = wishlist.findIndex(it => String(it?.title||"").trim() === String(itemTitle).trim());
        if(idx === -1) throw new Error("Item not found in wishlist.");

        const it = wishlist[idx];
        let donors = it?.donors || [];
        if(typeof donors === "string"){ try{ donors = JSON.parse(donors)||[] }catch{ donors=[] } }
        if(!Array.isArray(donors)) donors = [];

// ✅ Cap amount before pushing (prevents 29000 on 25000)
        const cappedAmount = capDonationAmountForItem(it, amount);
        if (cappedAmount <= 0) throw new Error("This item is already fully funded.");

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
        // Wishlist donation (prototype backend): وزّع على أقرب items للإغلاق
        let remaining = amount;

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

          // update donated
          x.it.donors = donors;

          // ✅ Clamp donated after sum (in case old data already overflowed)
          clampItemDonatedToPrice(x.it);
        }
      }

      await updateUserWishlist(recipientUserId, jwt, wishlist);

      if(msgEl) msgEl.textContent = "✅ Donation submitted!";

      // refresh UI by reloading public user
      setTimeout(()=>{ formModal.style.display="none"; window.location.reload(); }, 600);

    }catch(err){
      console.error(err);
      if(msgEl) msgEl.textContent = err?.message || "Submit failed";
    }
  });
}
