// js/donors-modal.js
import { getUserData } from "./getUserData.js";

function normalizeUser(u) {
  if (!u) return null;
  if (u.attributes) return { id: u.id, ...u.attributes };
  return u;
}

function normalizeWishlist(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normalizeDonors(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function money(n){
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function groupDonors(flatList) {
  // group by (email if exists) else by name
  const map = new Map();
  for (const d of flatList) {
    const key = (d.email || d.name || "Unknown").toLowerCase().trim();
    const prev = map.get(key) || { name: d.name || "Unknown", email: d.email || "", amount: 0, items: new Set(), bills: [] };
    prev.amount += money(d.amount);
    if (d.itemTitle) prev.items.add(d.itemTitle);
    if (d.bill) prev.bills.push(d.bill);
    map.set(key, prev);
  }
  return Array.from(map.values()).map(x => ({
    ...x,
    items: Array.from(x.items),
  }));
}

document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("view-donors-btn");
  const modal = document.getElementById("donorsModal");
  const closeBtn = document.getElementById("closeDonorsModal");

  const tabAll = document.getElementById("tabAllDonors");
  const tabItem = document.getElementById("tabItemDonors");

  const itemChooserBox = document.getElementById("itemChooserBox");
  const itemSelect = document.getElementById("donorsItemSelect");

  const summaryEl = document.getElementById("donorsSummary");
  const listEl = document.getElementById("donorsList");

  if (!openBtn || !modal || !closeBtn || !tabAll || !tabItem || !summaryEl || !listEl || !itemChooserBox || !itemSelect) return;

  let user = null;
  let wishlist = [];
  let activeTab = "all"; // all | item

  function setTab(next) {
    activeTab = next;

    tabAll.classList.toggle("active", next === "all");
    tabItem.classList.toggle("active", next === "item");

    itemChooserBox.style.display = (next === "item") ? "block" : "none";

    render();
  }

  function openModal() {
    modal.style.display = "flex";
  }
  function closeModal() {
    modal.style.display = "none";
  }

  function fillItems() {
    itemSelect.innerHTML = "";
    const items = wishlist.map(it => it?.title).filter(Boolean);
    if (!items.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No items";
      itemSelect.appendChild(opt);
      itemSelect.disabled = true;
      return;
    }

    itemSelect.disabled = false;
    for (const t of items) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      itemSelect.appendChild(opt);
    }
  }

  function renderEmpty(msg){
    summaryEl.textContent = "";
    listEl.innerHTML = `<div style="padding:12px;opacity:.8;">${msg}</div>`;
  }

  function renderList(rows, { showItemLabel = false } = {}) {
    if (!rows.length) return renderEmpty("No donors yet.");

    listEl.innerHTML = rows.map(r => {
      const itemInfo = showItemLabel && r.items?.length
        ? `<div class="donor-meta">Items: ${r.items.join(", ")}</div>`
        : (showItemLabel && r.itemTitle ? `<div class="donor-meta">Item: ${r.itemTitle}</div>` : "");

      const emailInfo = r.email ? `<div class="donor-meta">${r.email}</div>` : "";
      const receipt = (r.bill || (r.bills && r.bills[0])) ? (r.bill || r.bills[0]) : "";

      const receiptBtn = receipt
        ? `<span class="donor-receipt" data-bill="${encodeURIComponent(receipt)}">receipt</span>`
        : "";

      return `
        <div class="donor-row">
          <div class="donor-left">
            <div class="donor-name">${(r.name || "Unknown")}</div>
            ${emailInfo}
            ${itemInfo}
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="donor-amt">${money(r.amount)} EGP</div>
            ${receiptBtn}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAll() {
    // flatten all donors from all items
    const flat = [];
    for (const it of wishlist) {
      const donors = normalizeDonors(it?.donors);
      for (const d of donors) {
        flat.push({
          name: d?.name || "Unknown",
          email: d?.email || "",
          amount: money(d?.amount),
          bill: d?.bill || "",
          itemTitle: it?.title || "",
          type: d?.type || "", // sometimes wishlist donations are marked type:"wishlist"
        });
      }
    }

    if (!flat.length) return renderEmpty("No donors yet.");

    // group
    const grouped = groupDonors(flat).sort((a,b) => money(b.amount) - money(a.amount));

    const total = grouped.reduce((s,x)=> s + money(x.amount), 0);
    summaryEl.textContent = `Total donors: ${grouped.length} — Total donated: ${total} EGP`;

    renderList(grouped, { showItemLabel: true });
  }

  function renderItem() {
    const title = itemSelect.value;
    const it = wishlist.find(x => String(x?.title||"") === String(title||""));
    if (!it) return renderEmpty("Choose an item.");

    const donors = normalizeDonors(it?.donors)
      .map(d => ({
        name: d?.name || "Unknown",
        email: d?.email || "",
        amount: money(d?.amount),
        bill: d?.bill || "",
        itemTitle: it?.title || "",
        type: d?.type || ""
      }))
      .sort((a,b)=> money(b.amount) - money(a.amount));

    const total = donors.reduce((s,x)=> s + money(x.amount), 0);
    summaryEl.textContent = `Item: ${title} — Donors: ${donors.length} — Total: ${total} EGP`;

    renderList(donors);
  }

  function render() {
    if (!wishlist.length) return renderEmpty("No wishlist items.");

    if (activeTab === "item") renderItem();
    else renderAll();
  }

  async function loadUserFromLocalOrFetch() {
    // try localStorage first (user-profile.js بيحدّثها)
    try {
      const cached = JSON.parse(localStorage.getItem("user") || "null");
      if (cached) {
        user = normalizeUser(cached);
        wishlist = normalizeWishlist(user?.wishlist);
        return;
      }
    } catch {}

    // fallback fetch
    const u = normalizeUser(await getUserData());
    user = u;
    wishlist = normalizeWishlist(u?.wishlist);
  }

  // open
  openBtn.addEventListener("click", async () => {
    try {
      await loadUserFromLocalOrFetch();
      fillItems();
      setTab("all");
      openModal();
    } catch (e) {
      console.error(e);
      alert("Please login first.");
      window.location.href = "login.html";
    }
  });

  // close
  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.style.display === "flex") closeModal(); });

  // tabs
  tabAll.addEventListener("click", () => setTab("all"));
  tabItem.addEventListener("click", () => setTab("item"));

  // item change
  itemSelect.addEventListener("change", render);

  // receipt click
  listEl.addEventListener("click", (e) => {
    const el = e.target.closest(".donor-receipt");
    if (!el) return;
    const bill = decodeURIComponent(el.dataset.bill || "");
    if (bill) window.open(bill, "_blank");
  });
});
