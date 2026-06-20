// js/auth.js
import { API_BASE } from "./config.js";

const PENDING_REGISTRATION_PROFILE_KEY = "pendingRegistrationProfile";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function savePendingRegistrationProfile({ email, instaPayNumber, instaPayProfileLink }) {
  const pending = {
    email: normalizeEmail(email),
    instaPayNumber: String(instaPayNumber || "").trim(),
    instaPayProfileLink: String(instaPayProfileLink || "").trim(),
    savedAt: new Date().toISOString(),
  };

  if (!pending.email) return;

  localStorage.setItem(PENDING_REGISTRATION_PROFILE_KEY, JSON.stringify(pending));
}

function getPendingRegistrationProfile() {
  try {
    const raw = localStorage.getItem(PENDING_REGISTRATION_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingRegistrationProfile() {
  localStorage.removeItem(PENDING_REGISTRATION_PROFILE_KEY);
}

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

async function updateUserProfile({ token, userId, instaPayNumber, instaPayProfileLink }) {
  if (!token || !userId) return null;

  const payload = {};
  if (instaPayNumber) payload.instaPayNumber = instaPayNumber;
  if (instaPayProfileLink) payload.instaPayProfileLink = instaPayProfileLink;

  if (!Object.keys(payload).length) return null;

  const updateRes = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(payload),
  });

  const updatedUser = await parseJsonResponse(updateRes);
  return updatedUser?.data || updatedUser;
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
    const token = registerData?.jwt;
    const userId = registerData?.user?.id;

    // If Strapi Email Confirmation is enabled, registration succeeds but Strapi
    // does not return a JWT yet. This is a success state, not a UI error.
    if (!token || !userId) {
      savePendingRegistrationProfile({ email, instaPayNumber, instaPayProfileLink });

      return {
        requiresEmailConfirmation: true,
        email,
        user: registerData?.user || null,
      };
    }

    // Same GradApp route: PUT /api/users/:userId
    const updatedUser = await updateUserProfile({
      token,
      userId,
      instaPayNumber,
      instaPayProfileLink,
    });

    const user = updatedUser || registerData.user;

    saveAuth({ token, user: { ...registerData.user, ...user, id: userId } });
    clearPendingRegistrationProfile();
    return { user, loggedIn: true };
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

    let finalUser = user;
    saveAuth({ token, user: finalUser });

    // If the user registered while email confirmation was enabled, the browser
    // saved the InstaPay fields locally because there was no JWT to update Strapi.
    // After first confirmed login, complete that profile update automatically.
    const pendingProfile = getPendingRegistrationProfile();
    const pendingMatchesUser =
      pendingProfile &&
      (!pendingProfile.email || normalizeEmail(pendingProfile.email) === normalizeEmail(user.email));

    if (pendingMatchesUser) {
      try {
        const updatedUser = await updateUserProfile({
          token,
          userId: user.id,
          instaPayNumber: pendingProfile.instaPayNumber,
          instaPayProfileLink: pendingProfile.instaPayProfileLink,
        });

        if (updatedUser) {
          finalUser = { ...user, ...updatedUser, id: user.id };
          saveAuth({ token, user: finalUser });
        }

        clearPendingRegistrationProfile();
      } catch (profileError) {
        console.warn("Account created, but pending profile fields could not be saved after login:", profileError);
      }
    }

    return finalUser;
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
