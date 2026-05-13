// js/auth.js
import { API_BASE } from "./config.js";

function saveAuth({ token, user }) {
  localStorage.setItem("jwt", token);
  localStorage.setItem("token", token); // fallback compatible with GradApp naming

  if (user?.id) {
    localStorage.setItem("userId", String(user.id));
  }

  localStorage.setItem("user", JSON.stringify(user || {}));
}

async function parseJsonResponse(res) {
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Server returned non-JSON response");
  }

  if (!res.ok) {
    throw new Error(data?.error?.message || `Request failed: ${res.status}`);
  }

  return data;
}

export async function signUpUser({ username, email, password, instaPayNumber, instaPayProfileLink }) {
  try {
    // Same GradApp route: POST /api/auth/local/register
    const registerRes = await fetch(`${API_BASE}/api/auth/local/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ username, email, password }),
    });

    const registerData = await parseJsonResponse(registerRes);
    const token = registerData.jwt;
    const userId = registerData.user?.id;

    if (!token || !userId) {
      throw new Error("Register response missing token or user id");
    }

    // Same GradApp route: PUT /api/users/:userId
    const updateRes = await fetch(`${API_BASE}/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ instaPayNumber, instaPayProfileLink }),
    });

    const updatedUser = await parseJsonResponse(updateRes);
    const user = updatedUser?.data || updatedUser || registerData.user;

    saveAuth({ token, user: { ...registerData.user, ...user, id: userId } });
    return user;
  } catch (error) {
    console.error("Signup error:", error);
    throw error;
  }
}

export async function loginUser({ identifier, password }) {
  try {
    // Same GradApp route: POST /api/auth/local
    const res = await fetch(`${API_BASE}/api/auth/local`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await parseJsonResponse(res);
    const token = data.jwt;
    const user = data.user;

    if (!token || !user?.id) {
      throw new Error("Login response missing token or user id");
    }

    saveAuth({ token, user });
    return user;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}


export async function forgotPassword({ email }) {
  const cleanEmail = (email || "").trim();

  if (!cleanEmail) {
    throw new Error("Please enter your email first.");
  }

  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Server returned non-JSON response");
  }

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        "Failed to send reset email"
    );
  }

  return data;
}

export async function changePassword({ currentPassword, password, passwordConfirmation }) {
  const token = localStorage.getItem("jwt") || localStorage.getItem("token");

  if (!token) {
    throw new Error("User not logged in");
  }

  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      currentPassword,
      password,
      passwordConfirmation,
    }),
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Server returned non-JSON response");
  }

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        "Failed to change password"
    );
  }

  // Strapi may return a fresh JWT after changing the password.
  if (data?.jwt) {
    localStorage.setItem("jwt", data.jwt);
    localStorage.setItem("token", data.jwt);
  }

  if (data?.user) {
    localStorage.setItem("user", JSON.stringify(data.user));
    if (data.user.id) localStorage.setItem("userId", String(data.user.id));
  }

  return data;
}
