import { supabase } from "./supabase-client.js";

const els = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginPasswordToggle: document.getElementById("login-password-toggle"),
  passwordEyeOpen: document.getElementById("password-eye-open"),
  passwordEyeClosed: document.getElementById("password-eye-closed"),
  loginError: document.getElementById("login-error"),
  loginBtn: document.getElementById("login-btn"),
  roleTitle: document.getElementById("role-title"),
  roleSubtitle: document.getElementById("role-subtitle"),
  loggedUserEmail: document.getElementById("logged-user-email"),
  loggedUserRole: document.getElementById("logged-user-role"),
  appLayout: document.getElementById("app-layout"),
  sidebarToggleBtn: document.getElementById("sidebar-toggle-btn"),
  menuSpecializations: document.getElementById("menu-specializations"),
  menuHospital: document.getElementById("menu-hospital"),
  superAdminPanel: document.getElementById("super-admin-panel"),
  hospitalAdminPanel: document.getElementById("hospital-admin-panel"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  specializationSearch: document.getElementById("specialization-search"),
  specializationsBody: document.getElementById("specializations-body"),
  specializationModal: document.getElementById("specialization-modal"),
  specializationModalTitle: document.getElementById("specialization-modal-title"),
  specializationForm: document.getElementById("specialization-form"),
  specializationId: document.getElementById("specialization-id"),
  specializationName: document.getElementById("specialization-name"),
  specializationActive: document.getElementById("specialization-active"),
  specializationImageFile: document.getElementById("specialization-image-file"),
  openSpecializationModalBtn: document.getElementById("open-specialization-modal-btn"),
  doctorSearch: document.getElementById("doctor-search"),
  doctorsBody: document.getElementById("doctors-body"),
  doctorModal: document.getElementById("doctor-modal"),
  doctorModalTitle: document.getElementById("doctor-modal-title"),
  doctorForm: document.getElementById("doctor-form"),
  doctorId: document.getElementById("doctor-id"),
  doctorEmail: document.getElementById("doctor-email"),
  doctorLicense: document.getElementById("doctor-license"),
  doctorSpecialization: document.getElementById("doctor-specialization"),
  doctorVerified: document.getElementById("doctor-verified"),
  doctorImageFile: document.getElementById("doctor-image-file"),
  openDoctorModalBtn: document.getElementById("open-doctor-modal-btn"),
  toast: document.getElementById("toast"),
};

const state = {
  session: null,
  profileRole: null,
  hospitalId: null,
  specializations: [],
  doctors: [],
  specializationSearchText: "",
  doctorSearchText: "",
  activePage: "specializations",
  sidebarCollapsed: false,
};

let hasBootstrapped = false;

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => window.clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.style.borderColor = isError
    ? "rgba(255,111,145,0.45)"
    : "rgba(98,231,255,0.4)";
  els.toast.classList.remove("hidden");
  window.setTimeout(() => els.toast.classList.add("hidden"), 2200);
}

function setLoginError(message = "") {
  els.loginError.textContent = message;
  els.loginError.classList.toggle("hidden", !message);
}

function setLoading(buttonEl, loading, idleText) {
  buttonEl.disabled = loading;
  buttonEl.textContent = loading ? "Please wait..." : idleText;
}

function clearPersistedSupabaseSession() {
  const shouldRemove = (key) => key.startsWith("sb-") && key.includes("-auth-token");
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && shouldRemove(key)) {
      localStorage.removeItem(key);
    }
  }
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key && shouldRemove(key)) {
      sessionStorage.removeItem(key);
    }
  }
}

function extractObjectPath(bucket, rawValue) {
  const raw = (rawValue || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return raw.startsWith(`${bucket}/`) ? raw.slice(bucket.length + 1) : raw;
  }
  try {
    const uri = new URL(raw);
    const parts = uri.pathname.split("/").filter(Boolean);
    const publicMarker = ["storage", "v1", "object", "public", bucket];
    const signMarker = ["storage", "v1", "object", "sign", bucket];
    const indexOfMarker = (marker) => {
      for (let i = 0; i <= parts.length - marker.length; i += 1) {
        if (marker.every((value, idx) => parts[i + idx] === value)) {
          return i + marker.length;
        }
      }
      return -1;
    };
    const fromPublic = indexOfMarker(publicMarker);
    if (fromPublic >= 0) return parts.slice(fromPublic).join("/");
    const fromSign = indexOfMarker(signMarker);
    if (fromSign >= 0) return parts.slice(fromSign).join("/");
    const bucketIndex = parts.indexOf(bucket);
    if (bucketIndex >= 0) return parts.slice(bucketIndex + 1).join("/");
    return null;
  } catch {
    return null;
  }
}

async function renderableUrl(bucket, rawValue) {
  const path = extractObjectPath(bucket, rawValue);
  if (!path) return "";
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return rawValue || "";
  return data.signedUrl;
}

function showLoginView() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.superAdminPanel.classList.add("hidden");
  els.hospitalAdminPanel.classList.add("hidden");
}

function showAppView() {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
}

function setRoleUI(role) {
  const canSeeSpecializations = role === "super_admin";
  const canSeeHospital = role === "hospital_admin" || role === "super_admin";

  els.menuSpecializations.classList.toggle("menu-item-disabled", !canSeeSpecializations);
  els.menuHospital.classList.toggle("menu-item-disabled", !canSeeHospital);
  els.menuSpecializations.dataset.enabled = String(canSeeSpecializations);
  els.menuHospital.dataset.enabled = String(canSeeHospital);

  state.activePage = canSeeSpecializations ? "specializations" : "hospital";
  setActivePage(state.activePage);
}

function setActivePage(page) {
  state.activePage = page;
  const onSpecializations = page === "specializations";
  const onHospital = page === "hospital";

  els.menuSpecializations.classList.toggle("menu-item-active", onSpecializations);
  els.menuHospital.classList.toggle("menu-item-active", onHospital);

  els.superAdminPanel.classList.toggle("hidden", !onSpecializations);
  els.hospitalAdminPanel.classList.toggle("hidden", !onHospital);
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  els.appLayout.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarToggleBtn.textContent = state.sidebarCollapsed ? "Expand Menu" : "Collapse Menu";
}

async function loadActivePageData() {
  if (state.activePage === "specializations") {
    await loadSpecializations();
    return;
  }
  await Promise.all([loadSpecializationsForSelect(), loadDoctors()]);
}

async function getSessionContext() {
  const { data, error } = await supabase.rpc("admin_get_session_context");
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No profile found for this user.");
  }
  return data[0];
}

async function routeByRole() {
  const context = await getSessionContext();
  state.profileRole = context.role;
  state.hospitalId = context.hospital_id;
  showAppView();
  setRoleUI(context.role);
  els.loggedUserEmail.textContent = state.session?.user?.email || "Unknown email";
  els.loggedUserRole.textContent = context.role.replace("_", " ").toUpperCase();

  if (context.role === "super_admin") {
    els.roleTitle.textContent = "Super Admin Dashboard";
    els.roleSubtitle.textContent =
      "Manage platform specializations and review hospital doctor data from the side menu.";
    await loadActivePageData();
    return;
  }

  if (context.role === "hospital_admin") {
    els.roleTitle.textContent = "Hospital Admin Dashboard";
    els.roleSubtitle.textContent = "Manage your hospital doctors and assignments from the side menu.";
    await loadActivePageData();
    return;
  }

  await supabase.auth.signOut();
  showLoginView();
  throw new Error("Only super_admin and hospital_admin can access this dashboard.");
}

async function loadSpecializations() {
  const { data, error } = await supabase.rpc("admin_list_specializations", {
    search_text: state.specializationSearchText || null,
  });
  if (error) throw error;
  state.specializations = data ?? [];
  await renderSpecializations();
}

async function loadSpecializationsForSelect() {
  const { data, error } = await supabase.rpc("admin_list_specializations", {
    search_text: null,
  });
  if (error) throw error;
  state.specializations = data ?? [];
  els.doctorSpecialization.innerHTML = state.specializations
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join("");
}

async function renderSpecializations() {
  if (!state.specializations.length) {
    els.specializationsBody.innerHTML =
      '<tr><td colspan="4" class="muted">No specializations found.</td></tr>';
    return;
  }
  const rowsHtml = await Promise.all(
    state.specializations.map(async (s) => {
      const imageUrl = s.image_url
        ? await renderableUrl("profile-images", s.image_url)
        : "";
      return `
        <tr>
          <td>${imageUrl ? `<img class="thumb" src="${imageUrl}" alt="${escapeHtml(s.name)}">` : "-"}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${s.active ? '<span class="pill pill-yes">ACTIVE</span>' : '<span class="pill pill-no">INACTIVE</span>'}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-edit-specialization="${s.id}">Edit</button>
              <button class="icon-btn" data-delete-specialization="${s.id}">Delete</button>
            </div>
          </td>
        </tr>`;
    }),
  );
  els.specializationsBody.innerHTML = rowsHtml.join("");
}

async function loadDoctors() {
  const { data, error } = await supabase.rpc("admin_list_hospital_doctors", {
    search_text: state.doctorSearchText || null,
  });
  if (error) throw error;
  state.doctors = data ?? [];
  await renderDoctors();
}

async function renderDoctors() {
  if (!state.doctors.length) {
    els.doctorsBody.innerHTML =
      '<tr><td colspan="5" class="muted">No doctors found.</td></tr>';
    return;
  }
  const isSuperAdmin = state.profileRole === "super_admin";
  const rowsHtml = await Promise.all(
    state.doctors.map(async (d) => {
      const imageUrl = d.profile_image_url
        ? await renderableUrl("profile-images", d.profile_image_url)
        : "";
      return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:.6rem;">
            ${imageUrl ? `<img class="avatar" src="${imageUrl}" alt="${escapeHtml(d.doctor_name)}">` : ""}
            <div>
              <div>${escapeHtml(d.doctor_name)}</div>
              <div class="muted">${escapeHtml(d.doctor_email || "-")}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(d.specialization_name || "-")}</td>
        <td>${escapeHtml(d.moh_license_number || "-")}</td>
        <td>${d.verified ? '<span class="pill pill-yes">YES</span>' : '<span class="pill pill-no">NO</span>'}</td>
        <td>
          ${
            isSuperAdmin
              ? '<span class="muted text-xs">View only for super admin</span>'
              : `<div class="row-actions">
                  <button class="icon-btn" data-edit-doctor="${d.doctor_id}">Edit</button>
                  <button class="icon-btn" data-delete-doctor="${d.doctor_id}">Delete</button>
                </div>`
          }
        </td>
      </tr>`;
    }),
  );
  els.doctorsBody.innerHTML = rowsHtml.join("");
}

async function uploadImageToProfileBucket(file, folder) {
  if (!file) return null;
  const session = state.session;
  if (!session?.user?.id) throw new Error("No active user session.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${session.user.id}/${folder}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("profile-images")
    .upload(objectPath, file, { upsert: false, cacheControl: "3600" });
  if (error) throw error;
  return objectPath;
}

function openSpecializationModal(editItem = null) {
  els.specializationForm.reset();
  els.specializationId.value = editItem?.id || "";
  els.specializationName.value = editItem?.name || "";
  els.specializationActive.checked = editItem?.active ?? true;
  els.specializationModalTitle.textContent = editItem
    ? "Update Specialization"
    : "Add Specialization";
  els.specializationModal.classList.remove("hidden");
}

function closeSpecializationModal() {
  els.specializationModal.classList.add("hidden");
}

function openDoctorModal(editItem = null) {
  els.doctorForm.reset();
  els.doctorId.value = editItem?.doctor_id || "";
  els.doctorEmail.value = editItem?.doctor_email || "";
  els.doctorEmail.disabled = Boolean(editItem);
  els.doctorLicense.value = editItem?.moh_license_number || "";
  els.doctorVerified.checked = editItem?.verified ?? false;
  if (editItem?.specialization_id) {
    els.doctorSpecialization.value = editItem.specialization_id;
  }
  els.doctorModalTitle.textContent = editItem ? "Update Doctor" : "Add Doctor";
  els.doctorModal.classList.remove("hidden");
}

function closeDoctorModal() {
  els.doctorModal.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function submitSpecialization(event) {
  event.preventDefault();
  try {
    const id = els.specializationId.value || null;
    let imagePath = null;
    const file = els.specializationImageFile.files?.[0];
    if (file) imagePath = await uploadImageToProfileBucket(file, "specializations");
    const { error } = await supabase.rpc("admin_upsert_specialization", {
      p_id: id,
      p_name: els.specializationName.value.trim(),
      p_active: els.specializationActive.checked,
      p_image_url: imagePath,
    });
    if (error) throw error;
    closeSpecializationModal();
    await loadSpecializations();
    await loadSpecializationsForSelect();
    showToast(id ? "Specialization updated." : "Specialization created.");
  } catch (error) {
    showToast(error.message || "Specialization operation failed.", true);
  }
}

async function deleteSpecialization(id) {
  if (!window.confirm("Delete this specialization?")) return;
  const { error } = await supabase.rpc("admin_delete_specialization", { p_id: id });
  if (error) throw error;
  await loadSpecializations();
  await loadSpecializationsForSelect();
  showToast("Specialization deleted.");
}

async function submitDoctor(event) {
  event.preventDefault();
  try {
    const doctorId = els.doctorId.value || null;
    let imagePath = null;
    const file = els.doctorImageFile.files?.[0];
    if (file) imagePath = await uploadImageToProfileBucket(file, "doctor-profiles");

    if (!doctorId) {
      const { data: candidate, error: candidateError } = await supabase.rpc(
        "admin_find_doctor_by_email",
        { p_email: els.doctorEmail.value.trim().toLowerCase() },
      );
      if (candidateError) throw candidateError;
      if (!candidate || !candidate.length) {
        throw new Error("No doctor account found with this email.");
      }
      const existingDoctorId = candidate[0].doctor_id;
      const { error } = await supabase.rpc("admin_assign_hospital_doctor", {
        p_doctor_id: existingDoctorId,
      });
      if (error) throw error;
      const { error: updateError } = await supabase.rpc("admin_update_hospital_doctor", {
        p_doctor_id: existingDoctorId,
        p_moh_license_number: els.doctorLicense.value.trim(),
        p_specialization_id: els.doctorSpecialization.value,
        p_verified: els.doctorVerified.checked,
        p_profile_image_url: imagePath,
      });
      if (updateError) throw updateError;
      showToast("Doctor assigned and updated.");
    } else {
      const { error } = await supabase.rpc("admin_update_hospital_doctor", {
        p_doctor_id: doctorId,
        p_moh_license_number: els.doctorLicense.value.trim(),
        p_specialization_id: els.doctorSpecialization.value,
        p_verified: els.doctorVerified.checked,
        p_profile_image_url: imagePath,
      });
      if (error) throw error;
      showToast("Doctor updated.");
    }

    closeDoctorModal();
    await loadDoctors();
  } catch (error) {
    showToast(error.message || "Doctor operation failed.", true);
  }
}

async function removeDoctor(doctorId) {
  if (!window.confirm("Remove this doctor from your hospital?")) return;
  const { error } = await supabase.rpc("admin_remove_hospital_doctor", {
    p_doctor_id: doctorId,
  });
  if (error) throw error;
  await loadDoctors();
  showToast("Doctor removed from hospital.");
}

function bindEvents() {
  els.sidebarToggleBtn.addEventListener("click", toggleSidebar);

  els.menuSpecializations.addEventListener("click", async () => {
    if (els.menuSpecializations.dataset.enabled !== "true") {
      showToast("You do not have access to Specializations.", true);
      return;
    }
    setActivePage("specializations");
    await loadActivePageData();
  });

  els.menuHospital.addEventListener("click", async () => {
    if (els.menuHospital.dataset.enabled !== "true") {
      showToast("You do not have access to Hospital page.", true);
      return;
    }
    setActivePage("hospital");
    await loadActivePageData();
  });

  els.loginPasswordToggle.addEventListener("click", () => {
    const isCurrentlyHidden = els.loginPassword.type === "password";
    els.loginPassword.type = isCurrentlyHidden ? "text" : "password";
    els.passwordEyeOpen.classList.toggle("hidden", isCurrentlyHidden);
    els.passwordEyeClosed.classList.toggle("hidden", !isCurrentlyHidden);
    els.loginPasswordToggle.setAttribute(
      "aria-label",
      isCurrentlyHidden ? "Hide password" : "Show password",
    );
    els.loginPasswordToggle.setAttribute(
      "title",
      isCurrentlyHidden ? "Hide password" : "Show password",
    );
  });

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoading(els.loginBtn, true, "Login");
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: els.loginEmail.value.trim(),
          password: els.loginPassword.value,
        }),
        15000,
        "Login timed out. Check internet or Supabase credentials.",
      );
      if (error) {
        setLoginError(error.message);
        return;
      }
      const { data } = await supabase.auth.getSession();
      state.session = data.session;
      await routeByRole();
      showToast("Login successful.");
    } catch (routeError) {
      setLoginError(routeError.message);
      showLoginView();
    } finally {
      setLoading(els.loginBtn, false, "Login");
    }
  });

  els.logoutBtn.addEventListener("click", async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      clearPersistedSupabaseSession();
    }
    state.session = null;
    state.profileRole = null;
    state.hospitalId = null;
    showLoginView();
    showToast("Logged out.");
  });

  els.refreshBtn.addEventListener("click", async () => {
    try {
      await loadActivePageData();
      showToast("Dashboard refreshed.");
    } catch (error) {
      showToast(error.message || "Refresh failed.", true);
    }
  });

  els.openSpecializationModalBtn.addEventListener("click", () => openSpecializationModal());
  els.specializationForm.addEventListener("submit", submitSpecialization);
  document
    .querySelectorAll("[data-close-specialization-modal]")
    .forEach((el) => el.addEventListener("click", closeSpecializationModal));

  els.openDoctorModalBtn.addEventListener("click", () => {
    if (state.profileRole === "super_admin") {
      showToast("Super admin has read access on Hospital page in this dashboard.", true);
      return;
    }
    openDoctorModal();
  });
  els.doctorForm.addEventListener("submit", submitDoctor);
  document
    .querySelectorAll("[data-close-doctor-modal]")
    .forEach((el) => el.addEventListener("click", closeDoctorModal));

  els.specializationSearch.addEventListener("input", async () => {
    state.specializationSearchText = els.specializationSearch.value.trim();
    try {
      await loadSpecializations();
    } catch (error) {
      showToast(error.message || "Could not search specializations.", true);
    }
  });

  els.doctorSearch.addEventListener("input", async () => {
    state.doctorSearchText = els.doctorSearch.value.trim();
    try {
      await loadDoctors();
    } catch (error) {
      showToast(error.message || "Could not search doctors.", true);
    }
  });

  els.specializationsBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editId = target.getAttribute("data-edit-specialization");
    const deleteId = target.getAttribute("data-delete-specialization");
    if (editId) {
      const item = state.specializations.find((s) => s.id === editId);
      if (item) openSpecializationModal(item);
      return;
    }
    if (deleteId) {
      try {
        await deleteSpecialization(deleteId);
      } catch (error) {
        showToast(error.message || "Delete failed.", true);
      }
    }
  });

  els.doctorsBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editId = target.getAttribute("data-edit-doctor");
    const deleteId = target.getAttribute("data-delete-doctor");
    if (editId) {
      const item = state.doctors.find((d) => d.doctor_id === editId);
      if (item) openDoctorModal(item);
      return;
    }
    if (deleteId) {
      try {
        await removeDoctor(deleteId);
      } catch (error) {
        showToast(error.message || "Delete doctor failed.", true);
      }
    }
  });
}

function initMedicalAnimation() {
  const canvas = document.getElementById("medical-bg-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);

  let phase = 0;
  const draw = () => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(98,231,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const baseY = h * 0.7;
    for (let x = 0; x < w; x += 4) {
      const y = baseY + Math.sin((x + phase) * 0.015) * 8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    phase += 2.4;
    window.requestAnimationFrame(draw);
  };
  draw();
}

async function bootstrap() {
  bindEvents();
  initMedicalAnimation();
  try {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    if (!state.session) {
      showLoginView();
      hasBootstrapped = true;
      return;
    }
    await routeByRole();
    hasBootstrapped = true;
  } catch (error) {
    showLoginView();
    showToast(error.message || "Session check failed.", true);
    hasBootstrapped = true;
  }
}

supabase.auth.onAuthStateChange(async (event, session) => {
  state.session = session;

  // Only force login view on explicit sign-out events.
  if (event === "SIGNED_OUT") {
    showLoginView();
    return;
  }

  // During initial hydration, let bootstrap be the source of truth to avoid race flicker.
  if (event === "INITIAL_SESSION" && !hasBootstrapped) {
    return;
  }

  if (!session) {
    if (hasBootstrapped) {
      showLoginView();
    }
    return;
  }

  try {
    await routeByRole();
  } catch (error) {
    // Keep current session in place on transient/routing errors instead of
    // bouncing the user to login on refresh.
    showToast(error.message || "Role routing failed. Please refresh again.", true);
  }
});

bootstrap();

window.addEventListener("unhandledrejection", (event) => {
  setLoading(els.loginBtn, false, "Login");
  setLoginError(event.reason?.message || "Unexpected error occurred.");
});
