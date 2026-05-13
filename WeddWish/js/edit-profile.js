// js/edit-profile.js
import { getUserData } from "./getUserData.js";
import { changePassword } from "./auth.js";
import {
  getProfileAuth,
  normalizeUser,
  updateStoredUser,
  uploadProfileImage,
  updateUserProfile,
  PROFILE_IMAGE_FIELD,
} from "./profileApi.js";

const DEFAULT_AVATAR = "images/profile.jpeg";

function setPreviewImage(img, url) {
  if (!img) return;
  img.onerror = () => {
    img.src = DEFAULT_AVATAR;
  };
  img.src = url || DEFAULT_AVATAR;
}

function getInput(id) {
  return document.getElementById(id);
}

function isValidLinkWithScheme(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol);
  } catch {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("editProfileForm");
  const preview = document.getElementById("editAvatarPreview");
  const fileInput = document.getElementById("editAvatarFile");
  const choosePhotoBtn = document.getElementById("choosePhotoBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const statusEl = document.getElementById("editStatus");

  const usernameInput = getInput("editUsernameInput");
  const emailInput = getInput("editEmailInput");
  const instapayInput = getInput("editInstapayInput");
  const instaPayLinkInput = getInput("editInstaPayLinkInput");
  const currentPasswordInput = getInput("currentPasswordInput");
  const newPasswordInput = getInput("newPasswordInput");
  const confirmPasswordInput = getInput("confirmPasswordInput");

  let currentProfileImageUrl = "";
  let tempUrl = null;

  function setStatus(message, type = "") {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = type ? `edit-status-${type}` : "";
  }

  function setLoading(isLoading) {
    if (!saveBtn) return;
    saveBtn.disabled = isLoading;
    saveBtn.textContent = isLoading ? "Saving..." : "Save changes";
  }

  try {
    const userRaw = await getUserData();
    const user = normalizeUser(userRaw);

    if (!user) throw new Error("User not found");

    usernameInput.value = user.username || user.fullName || user.name || "";
    emailInput.value = user.email || "";
    instapayInput.value =
      user.instaPayNumber ||
      user.instapayNumber ||
      user.instapay ||
      user.walletNumber ||
      user.wallet ||
      "";
    instaPayLinkInput.value =
      user.instaPayProfileLink ||
      user.instapayProfileLink ||
      user.instaPayLink ||
      user.instapayLink ||
      "";

    currentProfileImageUrl = user.profileImageURL || user.profileImageUrl || "";
    setPreviewImage(preview, currentProfileImageUrl);
    updateStoredUser(user);
  } catch (error) {
    console.error(error);
    window.location.href = "login.html";
    return;
  }

  choosePhotoBtn?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file || !preview) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose a valid image file.");
      fileInput.value = "";
      return;
    }

    if (tempUrl) URL.revokeObjectURL(tempUrl);
    tempUrl = URL.createObjectURL(file);
    preview.src = tempUrl;
    setStatus("");
  });

  cancelBtn?.addEventListener("click", () => {
    window.location.href = "user-profile.html";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const instaPayNumber = instapayInput.value.trim();
    const instaPayProfileLink = instaPayLinkInput.value.trim();
    const currentPassword = currentPasswordInput?.value || "";
    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";
    const wantsPasswordChange = Boolean(currentPassword || newPassword || confirmPassword);
    const file = fileInput?.files?.[0] || null;

    if (username.length < 3) {
      setStatus("Username must be at least 3 characters.", "error");
      usernameInput.focus();
      return;
    }

    if (!instaPayProfileLink) {
      setStatus("InstaPay profile link is required.", "error");
      instaPayLinkInput.focus();
      return;
    }

    if (!isValidLinkWithScheme(instaPayProfileLink)) {
      setStatus("Please enter a valid InstaPay link with a scheme, like https:// or instapay://", "error");
      instaPayLinkInput.focus();
      return;
    }

    if (wantsPasswordChange) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setStatus("To change password, fill current password, new password, and confirmation.", "error");
        return;
      }

      if (newPassword.length < 6) {
        setStatus("New password must be at least 6 characters.", "error");
        newPasswordInput.focus();
        return;
      }

      if (newPassword !== confirmPassword) {
        setStatus("New password and confirmation do not match.", "error");
        confirmPasswordInput.focus();
        return;
      }
    }

    try {
      setLoading(true);
      setStatus(file ? "Uploading image..." : "Updating profile...");

      const { token, userId } = getProfileAuth();
      let profileImageURL = currentProfileImageUrl;

      if (file) {
        profileImageURL = await uploadProfileImage({ userId, file });
        setStatus("Updating profile...");
      }

      const profilePayload = {
        username,
        instaPayNumber,
        instaPayProfileLink,
      };

      // GradApp updates the same Strapi field name.
      if (profileImageURL) {
        profilePayload[PROFILE_IMAGE_FIELD] = profileImageURL;
      }

      const updatedUser = await updateUserProfile({
        userId,
        token,
        profile: profilePayload,
      });

      if (wantsPasswordChange) {
        setStatus("Changing password...");
        await changePassword({
          currentPassword,
          password: newPassword,
          passwordConfirmation: confirmPassword,
        });
      }

      updateStoredUser({
        ...updatedUser,
        id: Number(userId),
        username,
        instaPayNumber,
        instaPayProfileLink,
        ...(profileImageURL ? { profileImageURL } : {}),
      });

      if (currentPasswordInput) currentPasswordInput.value = "";
      if (newPasswordInput) newPasswordInput.value = "";
      if (confirmPasswordInput) confirmPasswordInput.value = "";

      setStatus(wantsPasswordChange ? "Profile and password updated successfully ✅" : "Profile updated successfully ✅", "success");
      window.location.href = "user-profile.html";
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Failed to update profile", "error");
      alert(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  });
});
