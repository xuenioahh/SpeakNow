const CURRENT_USER_KEY = "speaknow_current_user_id";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.sessionStorage);
}

function readText(key, fallback = "") {
  if (!canUseStorage()) return fallback;
  return window.sessionStorage.getItem(key) || fallback;
}

function writeText(key, value) {
  if (!canUseStorage()) return;
  if (!value) {
    window.sessionStorage.removeItem(key);
    return;
  }
  window.sessionStorage.setItem(key, value);
}

function getCurrentUserId() {
  return readText(CURRENT_USER_KEY, "");
}

function logoutUser() {
  writeText(CURRENT_USER_KEY, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export const localStore = {
  auth: {
    currentUserId: getCurrentUserId,
    currentUserIdOrNull: getCurrentUserId,
    setCurrentUserId(id) {
      writeText(CURRENT_USER_KEY, id || "");
    },
    clearCurrentUserId: logoutUser,
    logout: logoutUser,
  },
  session: {
    currentUserId: getCurrentUserId,
    currentUserIdOrNull: getCurrentUserId,
    setCurrentUserId(id) {
      writeText(CURRENT_USER_KEY, id || "");
    },
    clearCurrentUserId: logoutUser,
    logout: logoutUser,
  },
  async fileToDataUrl(file) {
    return fileToDataUrl(file);
  },
};
