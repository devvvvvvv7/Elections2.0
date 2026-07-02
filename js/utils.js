/* ==========================================================================
   UTILS.JS — Shared helper functions used across every page
   (toasts, confirmation modals, loader overlay, formatting helpers, icons)
   ========================================================================== */

/* ---- Inline SVG icon library -------------------------------------------------
   Centralised so every page references the same crisp, hand-drawn icon set
   instead of pulling in an icon-font dependency. ------------------------------ */
const ICONS = {
  seal: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle class="seal-ring" cx="32" cy="32" r="27"/>
      <path class="seal-check" d="M20 33 L28 41 L45 23"/>
    </svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.7 3.86a2 2 0 0 0-3.4 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" stroke-linecap="round"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke-linecap="round"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18l-1.5-9-4.5 4-3-6-3 6-4.5-4z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ballot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18" stroke-linecap="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16zM10 11v6M14 11v6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

/* ---- Loader overlay -------------------------------------------------------- */
function hideLoader() {
  const el = document.getElementById("loaderOverlay");
  if (el) el.classList.add("hidden");
}
function showLoader(text) {
  const el = document.getElementById("loaderOverlay");
  if (!el) return;
  el.classList.remove("hidden");
  const t = el.querySelector(".loader-text");
  if (t && text) t.textContent = text;
}

/* ---- Toast notifications ---------------------------------------------------- */
function ensureToastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message, type = "info", duration = 3800) {
  const stack = ensureToastStack();
  const icon = type === "success" ? ICONS.check : type === "error" ? ICONS.alert : ICONS.info;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

/* ---- Confirmation modal -----------------------------------------------------
   options: { title, message, confirmText, cancelText, danger, requireText,
              requirePassword, passwordLabel, onConfirm }
   - requireText: if set, user must type this exact text to enable confirm.
   - requirePassword: if true, adds a password field the user must fill in
     (non-empty) to enable confirm. The entered value is passed as the first
     argument to onConfirm(password) so the caller can verify it (e.g. against
     another admin role's credentials) — throwing inside onConfirm keeps the
     modal open and surfaces the error as a toast, same as any other failure. */
function showConfirmModal(options) {
  const {
    title = "Are you sure?",
    message = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = true,
    requireText = null, // if set, user must type this exact text to enable confirm
    requirePassword = false, // if true, an extra password field gates the confirm button
    passwordLabel = "Results Admin password",
    onConfirm = () => {}
  } = options;

  let backdrop = document.getElementById("globalModalBackdrop");
  if (backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.id = "globalModalBackdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-box glass-card">
      <div class="modal-icon">${ICONS.alert}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${requireText ? `<input type="text" class="modal-confirm-input" placeholder="Type ${requireText} to confirm" id="modalConfirmInput" autocomplete="off" />` : ""}
      ${requirePassword ? `<input type="password" class="modal-confirm-input" placeholder="${escapeHTML(passwordLabel)}" id="modalPasswordConfirmInput" autocomplete="off" style="text-transform:none; letter-spacing:normal; font-family:var(--font-body);" />` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modalCancelBtn">${cancelText}</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="modalConfirmBtn" ${(requireText || requirePassword) ? "disabled" : ""}>
          <span class="btn-label">${confirmText}</span><span class="spinner"></span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("open"));

  const closeModal = () => {
    backdrop.classList.remove("open");
    setTimeout(() => backdrop.remove(), 320);
  };

  backdrop.querySelector("#modalCancelBtn").addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });

  const textInput = requireText ? backdrop.querySelector("#modalConfirmInput") : null;
  const passwordInput = requirePassword ? backdrop.querySelector("#modalPasswordConfirmInput") : null;
  const confirmBtn = backdrop.querySelector("#modalConfirmBtn");

  const refreshEnabled = () => {
    const textOk = !requireText || (textInput && textInput.value.trim() === requireText);
    const passwordOk = !requirePassword || (passwordInput && passwordInput.value.length > 0);
    confirmBtn.disabled = !(textOk && passwordOk);
  };
  if (textInput) textInput.addEventListener("input", refreshEnabled);
  if (passwordInput) passwordInput.addEventListener("input", refreshEnabled);

  confirmBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("is-loading");
    try {
      await onConfirm(passwordInput ? passwordInput.value : undefined);
      closeModal();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Something went wrong. Please try again.", "error");
      btn.disabled = false;
      btn.classList.remove("is-loading");
      refreshEnabled();
    }
  });
}

/* ---- Text prompt modal --------------------------------------------------------
   A lightweight companion to showConfirmModal for when a short piece of text
   needs to be collected first (e.g. naming something before confirming a
   destructive action). options: { title, message, placeholder, defaultValue,
   confirmText, cancelText, onSubmit(value) }. onSubmit is only called if the
   user confirms; cancelling / closing does nothing. */
function showPromptModal(options) {
  const {
    title = "Enter a value",
    message = "",
    placeholder = "",
    defaultValue = "",
    confirmText = "Continue",
    cancelText = "Cancel",
    onSubmit = () => {}
  } = options;

  let backdrop = document.getElementById("globalModalBackdrop");
  if (backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.id = "globalModalBackdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-box glass-card">
      <div class="modal-icon">${ICONS.edit}</div>
      <h3>${title}</h3>
      ${message ? `<p>${message}</p>` : ""}
      <input type="text" class="modal-confirm-input" id="modalPromptInput" placeholder="${escapeHTML(placeholder)}" autocomplete="off" style="text-transform:none; letter-spacing:normal; font-family:var(--font-body);" />
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modalPromptCancelBtn">${cancelText}</button>
        <button class="btn btn-primary" id="modalPromptSubmitBtn">
          <span class="btn-label">${confirmText}</span><span class="spinner"></span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("open"));

  const input = backdrop.querySelector("#modalPromptInput");
  input.value = defaultValue;

  const closeModal = () => {
    backdrop.classList.remove("open");
    setTimeout(() => backdrop.remove(), 320);
  };

  backdrop.querySelector("#modalPromptCancelBtn").addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") backdrop.querySelector("#modalPromptSubmitBtn").click();
  });

  backdrop.querySelector("#modalPromptSubmitBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("is-loading");
    try {
      await onSubmit(input.value.trim());
      closeModal();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Something went wrong. Please try again.", "error");
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  });

  requestAnimationFrame(() => input.focus());
}

/* ---- Formatting helpers ------------------------------------------------------ */
function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function statusLabel(status) {
  const map = {
    not_started: "Not Started",
    ongoing: "Voting Open",
    stopped: "Voting Paused",
    ended: "Election Ended"
  };
  return map[status] || "Unknown";
}

/* Escape user-supplied text before injecting into innerHTML */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ---- Live clock --------------------------------------------------------------
   Renders the current date/time into any element with [data-clock-time] and
   [data-clock-date], updating every second. */
function startLiveClock() {
  const timeEls = document.querySelectorAll("[data-clock-time]");
  const dateEls = document.querySelectorAll("[data-clock-date]");
  if (!timeEls.length && !dateEls.length) return;
  const tick = () => {
    const now = new Date();
    timeEls.forEach((el) => (el.textContent = formatTime(now)));
    dateEls.forEach((el) => (el.textContent = formatDate(now)));
  };
  tick();
  setInterval(tick, 1000);
}

/* ---- Audit log writer ---------------------------------------------------------
   Every privileged admin action calls this so the audit trail stays complete.
   actorOverride lets callers log an attempted email for events where nobody
   is actually signed in yet (e.g. a failed login attempt). */
function logAuditEvent(action, role, details = "", actorOverride = null) {
  const entry = {
    action,
    role,
    actor: actorOverride || (auth.currentUser && auth.currentUser.email) || "system",
    details,
    timestamp: Date.now()
  };
  return db.ref(DB_PATHS.auditLogs).push(entry);
}

/* ---- Audit log categories -----------------------------------------------------
   Groups audit actions into sections for the filterable audit log view.
   Based on the "action" string set by each logAuditEvent(...) call. */
const AUDIT_CATEGORIES = {
  auth: { label: "Sign In / Out", actions: ["Admin login", "Admin logout", "Failed login attempt"] },
  voting: { label: "Voting Control", actions: ["Voting started", "Advanced to next voter", "Voting stopped", "Election ended", "Election reset"] },
  roster: { label: "Positions & Candidates", actions: ["Position added", "Position removed", "Candidate added", "Candidate removed", "Candidate edited", "Logo updated"] },
  results: { label: "Results", actions: ["CSV downloaded", "PDF downloaded", "Poster downloaded"] }
};
function getAuditCategory(action) {
  for (const [key, cat] of Object.entries(AUDIT_CATEGORIES)) {
    if (cat.actions.includes(action)) return key;
  }
  return "other";
}

/* ---- Shared branding: applies the school logo everywhere it appears ---------
   meta.logoUrl is a plain image URL (e.g. a raw GitHub link). If it's not
   set, every spot just keeps its default icon/seal artwork. */
function applyBrandLogo(logoUrl) {
  const targets = document.querySelectorAll(".seal, .emblem-mini, .school-emblem");
  if (!logoUrl) return;
  targets.forEach((el) => {
    if (el.dataset.logoApplied === logoUrl) return; // avoid needless re-renders
    el.innerHTML = `<img src="${escapeHTML(logoUrl)}" alt="School logo" />`;
    el.dataset.logoApplied = logoUrl;
  });
}

/* ---- Small DOM helper --------------------------------------------------------- */
function $(selector, scope = document) {
  return scope.querySelector(selector);
}
function $all(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/* ---- Dark / light theme toggle -----------------------------------------------
   Preference is stored in localStorage and applied to <html data-theme="...">.
   base.css re-declares every color variable under [data-theme="light"], so
   this one attribute switch re-themes the entire page. Each HTML page also
   has a tiny inline script in <head> that applies the saved preference
   before first paint, so there's no flash of the wrong theme on load. This
   function just wires up the floating toggle button, if present on the page. ---- */
const THEME_STORAGE_KEY = "schoolElection_theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function initThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (err) {
      console.warn("Could not save theme preference:", err);
    }
  });
}
document.addEventListener("DOMContentLoaded", initThemeToggle);

/* ---- Confetti burst -----------------------------------------------------------
   Lightweight, dependency-free canvas confetti — no external library needed.
   Used to celebrate when final election results are revealed. Plays for a
   few seconds then removes itself completely. ---------------------------------- */
function fireConfetti(durationMs = 2600) {
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const colors = ["#d4af37", "#f0d27a", "#2dd4bf", "#5b9dff", "#e5484d", "#edeff2"];
  const pieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    r: 4 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: -1.6 + Math.random() * 3.2,
    vy: 2 + Math.random() * 2.6,
    rot: Math.random() * Math.PI * 2,
    vr: -0.22 + Math.random() * 0.44,
    isRect: Math.random() < 0.5
  }));

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.isRect) {
        ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      window.removeEventListener("resize", resize);
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}
