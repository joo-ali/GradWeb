import { API_BASE } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { fetchProductDetailsFromWeb } from "./product-fetcher.js";

const params = new URLSearchParams(window.location.search);
const editIndexParam = params.get("editIndex");
const isEditMode = editIndexParam !== null;
const editIndex = Number(editIndexParam);

let originalItem = null;
let originalWishlist = [];
let fetchedProductImageUrl = "";
let fetchedProductImageName = "";

const STORAGE_BUCKET = "user-uploads";
const WISHLIST_FOLDER = "whishList";

// helpers
function safeTitle(title) {
  return (title || "item").trim().replaceAll(" ", "_");
}

function safeFileName(originalName = "img.png") {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? parts.pop() : "png";
  return `img_${Date.now()}.${ext}`;
}

function wishlistItemBasePath(userId, itemTitle) {
  return `users/${userId}/${WISHLIST_FOLDER}/${safeTitle(itemTitle)}`;
}

function wishlistItemSubPath(userId, itemTitle, subFolder) {
  return `${wishlistItemBasePath(userId, itemTitle)}/${subFolder}`;
}

function getPublicStorageUrl(path) {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

function getFileNameFromUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const name = parsed.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(name);
  } catch {
    const name = raw.split("?")[0].split("/").filter(Boolean).pop() || "";
    try { return decodeURIComponent(name); } catch { return name; }
  }
}

function getStoragePathFromPublicUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const marker = `/object/public/${STORAGE_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return "";
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return "";
  }
}

function getWishlistBaseFromImageUrl(imageUrl = "") {
  const storagePath = getStoragePathFromPublicUrl(imageUrl);
  const match = storagePath.match(/^(users\/[^/]+\/whishList\/[^/]+)/);
  return match?.[1] || "";
}

async function moveStorageFile(from, to) {
  if (from === to) return;

  let { error } = await supabase.storage.from(STORAGE_BUCKET).move(from, to);

  // لو الملف موجود في المكان الجديد من محاولة سابقة، امسحه وجرب تاني
  if (error && /exist|already|duplicate/i.test(error.message || "")) {
    await supabase.storage.from(STORAGE_BUCKET).remove([to]);
    ({ error } = await supabase.storage.from(STORAGE_BUCKET).move(from, to));
  }

  if (error) throw new Error(`Supabase move failed: ${error.message}`);
}

async function renameWishlistItemInSupabase({ userId, oldTitle, newTitle, oldImageUrl = "" }) {
  const oldSafe = safeTitle(oldTitle);
  const newSafe = safeTitle(newTitle);

  if (!oldSafe || !newSafe || oldSafe === newSafe) return;

  const targetBase = wishlistItemBasePath(userId, newTitle);
  const sourceBases = new Set([wishlistItemBasePath(userId, oldTitle)]);

  // احتياطي: لو الصورة القديمة موجودة في فولدر قديم مختلف عن اسم الآيتم الحالي
  // هننقل من المسار الحقيقي الموجود في public URL كمان.
  const imageBase = getWishlistBaseFromImageUrl(oldImageUrl);
  if (imageBase) sourceBases.add(imageBase);

  async function moveAllFiles(sourceBase, subFolder) {
    if (!sourceBase || sourceBase === targetBase) return;

    const oldPath = `${sourceBase}/${subFolder}`;
    const newPath = `${targetBase}/${subFolder}`;

    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(oldPath);
    if (error) throw new Error(`Supabase list failed: ${error.message}`);

    const files = (data || []).filter((f) => f?.name && f?.metadata !== null);

    for (const f of files) {
      await moveStorageFile(`${oldPath}/${f.name}`, `${newPath}/${f.name}`);
    }
  }

  for (const sourceBase of sourceBases) {
    await moveAllFiles(sourceBase, "itemImages");
    await moveAllFiles(sourceBase, "itemBills");
  }
}

async function fileToUint8Array(file) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

function normalizeUrl(raw = "") {
  const url = String(raw || "").trim();
  if (!url) return "";
  // لو اليوزر كتب بدون https زي amazon.com
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function normalizeWishlist(rawWishlist) {
  if (!rawWishlist) return [];
  if (typeof rawWishlist === "string") {
    try { return JSON.parse(rawWishlist) || []; } catch { return []; }
  }
  if (Array.isArray(rawWishlist)) return rawWishlist;
  return [];
}

async function uploadWishlistItemImage({ userId, itemTitle, file, fileNameOverride = "" }) {
  const bytes = await fileToUint8Array(file);
  const filename = fileNameOverride || safeFileName(file.name);

  // ✅ نفس path بتاع Flutter: users/{id}/whishList/{title}/itemImages/{filename}
  // في وضع Edit لو فيه صورة قديمة، بنستخدم نفس اسم الملف عشان نعمل overwrite بدل ما نعمل file جديد.
  const path = `${wishlistItemSubPath(userId, itemTitle, "itemImages")}/${filename}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { upsert: true, contentType: file.type || "image/png" });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const publicUrl = getPublicStorageUrl(path);
  if (!publicUrl) throw new Error("Failed to get public URL");

  return { publicUrl, path };
}

async function urlToFile(imageUrl, fallbackName = "fetched-product-image.jpg") {
  const normalizedImageUrl = normalizeUrl(imageUrl);
  if (!normalizedImageUrl) throw new Error("Invalid fetched image URL.");

  const res = await fetch(normalizedImageUrl, { mode: "cors", redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download fetched image: ${res.status}`);

  const blob = await res.blob();
  if (!blob || !blob.size) throw new Error("Fetched image is empty.");

  const contentType = blob.type || "image/jpeg";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const cleanName = fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`;

  return new File([blob], cleanName, { type: contentType });
}

async function uploadFetchedProductImage({ userId, itemTitle, imageUrl, fileNameOverride = "" }) {
  const fallbackName = fileNameOverride || getFileNameFromUrl(imageUrl) || "fetched-product-image.jpg";
  const file = await urlToFile(imageUrl, fallbackName);

  return uploadWishlistItemImage({
    userId,
    itemTitle,
    file,
    fileNameOverride,
  });
}

async function getCurrentUserIdAndToken() {
  const jwt = localStorage.getItem("jwt") || localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const fallbackUserId = localStorage.getItem("userId");

  if (!jwt && !localStorage.getItem("token")) throw new Error("User not logged in");

  let userId = fallbackUserId;
  if (!userId && userStr) {
    try {
      userId = JSON.parse(userStr)?.id;
    } catch {}
  }

  if (!userId) throw new Error("User not logged in");

  return { userId, jwt };
}

async function fetchUser(userId, jwt) {
  const res = await fetch(`${API_BASE}/api/users/${userId}?populate=*`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "ngrok-skip-browser-warning": "true",
    },
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned non-JSON"); }

  if (!res.ok) throw new Error(data?.error?.message || `Failed to fetch user: ${res.status}`);
  return (data && data.data) ? data.data : data;
}

async function updateWishlist(userId, jwt, newWishlist) {
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ wishlist: newWishlist }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned non-JSON"); }

  if (!res.ok) throw new Error(data?.error?.message || `Failed to update user: ${res.status}`);
  return data;
}

// UI
const form = document.getElementById("addItemForm");
const msg = document.getElementById("addItemMsg");
const itemNameInput = document.getElementById("itemName");
const itemGoalInput = document.getElementById("itemGoal");
const itemUrlInput = document.getElementById("itemUrl");
const fileInput = document.getElementById("product-image");
const fileNameEl = document.getElementById("fileName");
const uploadBox = document.querySelector(".image-upload-box");
const submitBtn = document.getElementById("submitItemBtn") || form?.querySelector('button[type="submit"]');
const fetchItemDetailsBtn = document.getElementById("fetchItemDetailsBtn");
const fetchItemHint = document.getElementById("fetchItemHint");

function setMsg(text, ok = false) {
  if (!msg) return;
  msg.textContent = text;
  msg.style.color = ok ? "#9ff2b2" : "#ff9f9f";
}

function setButtonLoading(isLoading, text = "") {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;
  if (text) submitBtn.textContent = text;
}

function setFetchButtonLoading(isLoading) {
  if (!fetchItemDetailsBtn) return;
  fetchItemDetailsBtn.disabled = isLoading;
  fetchItemDetailsBtn.innerHTML = isLoading
    ? '<i class="fa fa-spinner fa-spin"></i> Fetching...'
    : '<i class="fa fa-magic"></i> Fetch item details';
}

function showFetchedImagePreview(imageUrl) {
  if (!uploadBox || !imageUrl) return;

  uploadBox.classList.add("has-fetched-image");
  uploadBox.style.setProperty("--fetched-item-image", `url("${imageUrl.replace(/"/g, "%22")}")`);

  if (fileNameEl) {
    fileNameEl.textContent = "Image fetched from item link";
  }
}

function clearFetchedImagePreview() {
  fetchedProductImageUrl = "";
  fetchedProductImageName = "";
  if (!uploadBox) return;
  uploadBox.classList.remove("has-fetched-image");
  uploadBox.style.removeProperty("--fetched-item-image");
}

function setupUploadBox() {
  if (!uploadBox || !fileInput) return;

  uploadBox.addEventListener("click", (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) clearFetchedImagePreview();
    if (fileNameEl) fileNameEl.textContent = file ? file.name : "No image selected";
  });
}

function setEditUi() {
  document.title = "WeddWish | Edit Item";
  document.getElementById("itemFormBadge")?.replaceChildren(document.createTextNode("Edit item"));
  document.getElementById("itemFormTitle")?.replaceChildren(document.createTextNode("Edit gift"));
  document.getElementById("itemFormSubtitle")?.replaceChildren(document.createTextNode("Update this wishlist item details."));
  if (submitBtn) submitBtn.textContent = "Save changes";
  if (fileNameEl) fileNameEl.textContent = "Current image will be kept if you do not choose a new one";
}

function setupFetchProductDetails() {
  if (!fetchItemDetailsBtn || !itemUrlInput) return;

  fetchItemDetailsBtn.addEventListener("click", async () => {
    const url = itemUrlInput.value?.trim();
    if (!url) return setMsg("Please paste the item link first.");

    try {
      setMsg("Fetching item details...", true);
      if (fetchItemHint) fetchItemHint.textContent = "Reading product title, price, and image...";
      setFetchButtonLoading(true);

      const data = await fetchProductDetailsFromWeb(url);

      if (data.title && itemNameInput && !itemNameInput.value.trim()) {
        itemNameInput.value = data.title;
      } else if (data.title && itemNameInput && confirm("Replace current item name with fetched title?")) {
        itemNameInput.value = data.title;
      }

      if (data.price !== null && data.price !== undefined && itemGoalInput && !itemGoalInput.value.trim()) {
        itemGoalInput.value = Math.ceil(Number(data.price));
      } else if (data.price !== null && data.price !== undefined && itemGoalInput && confirm("Replace current target amount with fetched price?")) {
        itemGoalInput.value = Math.ceil(Number(data.price));
      }

      if (data.imageUrl) {
        fetchedProductImageUrl = data.imageUrl;
        fetchedProductImageName = getFileNameFromUrl(data.imageUrl) || "fetched-product-image.jpg";
        if (fileInput) fileInput.value = "";
        showFetchedImagePreview(data.imageUrl);
      }

      const foundParts = [
        data.title ? "title" : "",
        data.price !== null && data.price !== undefined ? "price" : "",
        data.imageUrl ? "image" : "",
      ].filter(Boolean).join(", ");

      setMsg(foundParts ? `Fetched ${foundParts} ✅` : "No details found. Fill the form manually.", Boolean(foundParts));
      if (fetchItemHint) fetchItemHint.textContent = foundParts ? `Fetched: ${foundParts}. Please review before saving.` : "Could not fetch details from this link.";
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Failed to fetch item details. Fill it manually.");
      if (fetchItemHint) fetchItemHint.textContent = "Some websites block browser fetching. You can still fill the fields manually.";
    } finally {
      setFetchButtonLoading(false);
    }
  });
}

async function loadEditItem() {
  if (!isEditMode) return;

  if (!Number.isInteger(editIndex) || editIndex < 0) {
    throw new Error("Invalid item selected for edit.");
  }

  setEditUi();
  setMsg("Loading item...", true);

  const { userId, jwt } = await getCurrentUserIdAndToken();
  const user = await fetchUser(userId, jwt);
  originalWishlist = normalizeWishlist(user?.wishlist);
  originalItem = originalWishlist[editIndex];

  if (!originalItem) throw new Error("Item not found.");

  if (itemNameInput) itemNameInput.value = originalItem.title || "";
  if (itemGoalInput) itemGoalInput.value = Number(originalItem.price || 0) || "";
  if (itemUrlInput) itemUrlInput.value = /example\.com/i.test(originalItem.url || "") ? "" : (originalItem.url || "");

  setMsg("");
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");

  const name = itemNameInput?.value?.trim();
  const goal = Number(itemGoalInput?.value);
  const productUrl = normalizeUrl(itemUrlInput?.value || "");
  const file = fileInput?.files?.[0];

  if (!name) return setMsg("Item name is required.");
  if (!goal || goal < 1) return setMsg("Target amount must be at least 1.");
  if (!isEditMode && !file && !fetchedProductImageUrl) return setMsg("Please upload an item image or fetch it from the item link.");

  try {
    setButtonLoading(true, isEditMode ? "Saving..." : "Adding...");
    setMsg(file ? "Uploading image..." : "Saving item...", true);

    const { userId, jwt } = await getCurrentUserIdAndToken();

    // نجيب آخر نسخة من wishlist قبل الحفظ عشان ما نمسحش أي تبرع حصل في النص
    const user = await fetchUser(userId, jwt);
    const currentWishlist = normalizeWishlist(user?.wishlist);

    if (isEditMode) {
      const currentItem = currentWishlist[editIndex];
      if (!currentItem) throw new Error("Item not found.");

      const donated = Number(currentItem?.donated || 0);
      if (goal < donated) {
        setButtonLoading(false, "Save changes");
        return setMsg(`Target amount cannot be less than donated amount (${donated} EGP).`);
      }

      const oldTitle = currentItem.title || originalItem?.title || name;
      let imageUrl = currentItem.image || originalItem?.image || "";
      const oldImageFileName = getFileNameFromUrl(imageUrl);
      const titleChanged = safeTitle(oldTitle) !== safeTitle(name);

      // لو الاسم اتغير، انقل ملفات Supabase من فولدر الاسم القديم للجديد بدل ما نسيب فولدر قديم ونعمل واحد جديد.
      if (titleChanged) {
        setMsg("Renaming item folder...", true);
        await renameWishlistItemInSupabase({
          userId,
          oldTitle,
          newTitle: name,
          oldImageUrl: imageUrl,
        });

        // لو المستخدم ما اختارش صورة جديدة، لازم نحدث لينك الصورة لأنه اتنقل لمسار الاسم الجديد.
        if (!file && oldImageFileName) {
          imageUrl = getPublicStorageUrl(
            `${wishlistItemSubPath(userId, name, "itemImages")}/${oldImageFileName}`
          );
        }
      }

      if (file) {
        const upload = await uploadWishlistItemImage({
          userId,
          itemTitle: name,
          file,
          fileNameOverride: oldImageFileName || "",
        });
        imageUrl = upload.publicUrl;
      } else if (fetchedProductImageUrl) {
        try {
          setMsg("Saving fetched image...", true);
          const upload = await uploadFetchedProductImage({
            userId,
            itemTitle: name,
            imageUrl: fetchedProductImageUrl,
            fileNameOverride: oldImageFileName || fetchedProductImageName || "",
          });
          imageUrl = upload.publicUrl;
        } catch (imageErr) {
          console.warn("Could not copy fetched image to Supabase; using external image URL.", imageErr);
          imageUrl = fetchedProductImageUrl;
        }
      }

      if (!imageUrl) throw new Error("Please upload an item image or fetch it from the item link.");

      currentWishlist[editIndex] = {
        ...currentItem,
        id: currentItem.id || originalItem?.id || Date.now(),
        title: name,
        price: goal,
        url: productUrl,
        image: imageUrl,
        updatedAt: new Date().toISOString(),
      };

      setMsg("Saving item...", true);
      await updateWishlist(userId, jwt, currentWishlist);
      setMsg("Item updated successfully ✅", true);
    } else {
      let imageUrl = "";

      if (file) {
        const upload = await uploadWishlistItemImage({
          userId,
          itemTitle: name,
          file,
        });
        imageUrl = upload.publicUrl;
      } else if (fetchedProductImageUrl) {
        try {
          setMsg("Saving fetched image...", true);
          const upload = await uploadFetchedProductImage({
            userId,
            itemTitle: name,
            imageUrl: fetchedProductImageUrl,
            fileNameOverride: fetchedProductImageName || "",
          });
          imageUrl = upload.publicUrl;
        } catch (imageErr) {
          console.warn("Could not copy fetched image to Supabase; using external image URL.", imageErr);
          imageUrl = fetchedProductImageUrl;
        }
      }

      const newItem = {
        id: Date.now(),
        title: name,
        price: goal,
        url: productUrl,
        image: imageUrl,
        createdAt: new Date().toISOString(),
        donated: 0,
        donors: [],
      };

      currentWishlist.push(newItem);

      setMsg("Saving item...", true);
      await updateWishlist(userId, jwt, currentWishlist);
      setMsg("Item added successfully ✅", true);
    }

    window.location.href = "user-profile.html";
  } catch (err) {
    console.error(err);
    setButtonLoading(false, isEditMode ? "Save changes" : "Add to wishlist");
    setMsg(err?.message || "Something went wrong.");
  }
});

setupUploadBox();
setupFetchProductDetails();
loadEditItem().catch((err) => {
  console.error(err);
  setMsg(err?.message || "Failed to load item.");
});
