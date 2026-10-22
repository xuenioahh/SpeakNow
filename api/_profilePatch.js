export function validateProfilePatch(payload = {}) {
  const patch = {};
  if (Object.hasOwn(payload, "full_name")) {
    const name = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
    if (!name || name.length > 80) throw new Error("Name must contain 1–80 characters");
    patch.full_name = name;
  }
  if (Object.hasOwn(payload, "avatar_url")) {
    const url = payload.avatar_url;
    if (typeof url !== "string" || url.length > 2900000 || (url !== "" && !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(url) && !/^https:\/\//.test(url))) throw new Error("Invalid profile photo");
    patch.avatar_url = url;
  }
  if (Object.hasOwn(payload, "profile_preferences")) {
    const p = payload.profile_preferences;
    if (!p || !Number.isInteger(p.weekly_goal) || p.weekly_goal < 1 || p.weekly_goal > 7 || !["voice", "presentation"].includes(p.practice_focus)) throw new Error("Choose a weekly goal of 1–7 sessions and a valid practice focus");
    patch.profile_preferences = { weekly_goal: p.weekly_goal, practice_focus: p.practice_focus };
  }
  // Profile edits cannot change account IDs, email ownership, passwords or roles.
  if (Object.keys(payload).some(key => !["full_name", "avatar_url", "profile_preferences"].includes(key))) throw new Error("Unsupported profile field");
  return patch;
}
