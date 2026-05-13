import { API_BASE } from "./config.js";

export async function getUserData() {
  // ✅ الأساس عندكم في المشروع
  const jwt = localStorage.getItem("jwt");
  const userStr = localStorage.getItem("user");

  // ✅ fallback لو حد مخزنهم زي Flutter (token/userId)
  const tokenFallback = localStorage.getItem("token");
  const userIdFallback = localStorage.getItem("userId");

  if ((!jwt || !userStr) && (!tokenFallback || !userIdFallback)) {
    throw new Error("User not logged in");
  }

  let token = jwt || tokenFallback;
  let userId = userIdFallback;

  if (!userId && userStr) {
    try {
      const userObj = JSON.parse(userStr);
      userId = userObj?.id;
    } catch {
      // ignore
    }
  }

  if (!token || !userId) {
    throw new Error("User not logged in");
  }

  const res = await fetch(`${API_BASE}/api/users/${userId}?populate=*`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true", // ✅ السطر المطلوب
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("RAW RESPONSE:", text);
    throw new Error("Server returned non-JSON");
  }

  if (!res.ok) {
    throw new Error(data?.error?.message || `Request failed: ${res.status}`);
  }

  return (data && data.data) ? data.data : data;
}
