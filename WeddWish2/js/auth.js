// js/auth.js

const BASE_URL = "https://a569047a5402.ngrok-free.app";

export async function signUpUser({ username, email, password, instaPayNumber, address }) {
  try {
    // STEP 1: Register user
    const registerRes = await fetch(`${BASE_URL}/api/auth/local/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    const registerData = await registerRes.json();

    if (!registerRes.ok) {
      throw new Error(registerData?.error?.message || "Register failed");
    }

    const token = registerData.jwt;
    const userId = registerData.user.id;

    // STEP 2: Update custom fields
    const updateRes = await fetch(`${BASE_URL}/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instaPayNumber,
        address,
      }),
    });

    const updatedUser = await updateRes.json();

    if (!updateRes.ok) {
      throw new Error(updatedUser?.error?.message || "Update user failed");
    }

    // STEP 3: Save auth locally
    localStorage.setItem("jwt", token);
    localStorage.setItem("user", JSON.stringify(updatedUser));

    return updatedUser;
  } catch (error) {
    console.error("Signup error:", error);
    throw error;
  }
}

export async function loginUser({ identifier, password }) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/local`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error?.message || "Login failed");
    }

    const token = data.jwt;
    const user = data.user;

    localStorage.setItem("jwt", token);
    localStorage.setItem("user", JSON.stringify(user));

    return user;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}
