/* ==========================================================================
   CONTROL-ADMIN.JS — Control Admin dashboard logic (control-admin.html)
   --------------------------------------------------------------------------
   Responsibilities: secure login (role = "control"), start/stop/end/reset
   the election, show live voter count & status, and render the audit log.
   This role intentionally has NO access to candidate-level vote results.
   ========================================================================== */

const ROLE = "control";
let currentMeta = {};
let eligibleInputFocused = false;
let positionsData = {};
let candidatesData = {};
let selectedPhotoDataUrl = null;
let latestAuditEntries = [];
let activeAuditCategory = "all";

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  bindLogin();
  bindActions();
  bindManageForms();
  bindLogoField();
  bindAuditTabs();
  startLiveClock();

  let authCheckToken = 0;
  auth.onAuthStateChanged(async (user) => {
    const myToken = ++authCheckToken; // marks this as the latest check in flight

    if (!user) {
      showLoginScreen();
      hideLoader();
      return;
    }
    try {
      const snap = await db.ref(`${DB_PATHS.admins}/${user.uid}`).once("value");
      if (myToken !== authCheckToken) return; // a newer auth state change already superseded this one

      const profile = snap.val();
      if (profile && profile.role === ROLE) {
        showDashboard(profile);
      } else {
        // Anonymous sessions (e.g. a voting.html kiosk tab open elsewhere on
        // the same origin) legitimately have no admins entry — that's
        // expected, not a misconfiguration, so don't warn about it.
        if (!user.isAnonymous) {
          console.warn(
            `[control-admin] No matching admins/${user.uid} entry with role "${ROLE}". ` +
            `Found: ${JSON.stringify(profile)}. Check Realtime Database → admins in the Firebase console.`
          );
        }
        // IMPORTANT: do NOT call auth.signOut() here. Firebase Auth sessions
        // are shared across every tab on this origin (Control Admin, Results
        // Admin, voting kiosk all share one session). Signing out here would
        // also kill a perfectly valid Results Admin session open in another
        // tab. Just show this dashboard's login screen and leave the shared
        // session alone — submitting the login form below will naturally
        // switch to a different account if needed.
        showLoginScreen(
          profile
            ? "This account is not authorized for Control Admin access."
            : "This account is not authorized for Control Admin access. (Signed in elsewhere as a different role? Just log in below with a Control Admin account.)"
        );
      }
    } catch (err) {
      // Most likely cause: security rules were never published in the Firebase
      // console (firebase-rules.json is just a reference file — it has to be
      // pasted into Database → Rules → Publish manually).
      console.error(`[control-admin] Failed to read admins/${user.uid}:`, err);
      showLoginScreen("Could not verify admin access. Check the browser console for details.");
    }
    hideLoader();
  });

  setTimeout(hideLoader, 4000);
});

function cacheEls() {
  els.loginShell = document.getElementById("loginShell");
  els.dashShell = document.getElementById("dashShell");
  els.loginForm = document.getElementById("loginForm");
  els.loginEmail = document.getElementById("loginEmail");
  els.loginPassword = document.getElementById("loginPassword");
  els.loginError = document.getElementById("loginError");
  els.loginBtn = document.getElementById("loginBtn");

  els.statusBadge = document.getElementById("dashStatusBadge");
  els.voteCountValue = document.getElementById("voteCountValue");
  els.eligibleInput = document.getElementById("eligibleInput");
  els.eligibleSaveBtn = document.getElementById("eligibleSaveBtn");
  els.turnoutValue = document.getElementById("turnoutValue");
  els.votingStatusValue = document.getElementById("votingStatusValue");

  els.startBtn = document.getElementById("startVotingBtn");
  els.nextVoterBtn = document.getElementById("nextVoterBtn");
  els.stopBtn = document.getElementById("stopVotingBtn");
  els.endBtn = document.getElementById("endElectionBtn");
  els.resetBtn = document.getElementById("resetElectionBtn");

  els.auditBody = document.getElementById("auditTableBody");
  els.auditTabs = document.getElementById("auditTabs");
  els.logoutBtn = document.getElementById("logoutBtn");

  els.positionsManageList = document.getElementById("positionsManageList");
  els.addPositionForm = document.getElementById("addPositionForm");
  els.newPositionTitle = document.getElementById("newPositionTitle");
  els.addPositionBtn = document.getElementById("addPositionBtn");

  els.candidateFilterSelect = document.getElementById("candidateFilterSelect");
  els.candidatesManageList = document.getElementById("candidatesManageList");
  els.addCandidateForm = document.getElementById("addCandidateForm");
  els.newCandidateName = document.getElementById("newCandidateName");
  els.newCandidatePosition = document.getElementById("newCandidatePosition");
  els.newCandidatePhotoFile = document.getElementById("newCandidatePhotoFile");
  els.newCandidatePhotoUrl = document.getElementById("newCandidatePhotoUrl");
  els.newCandidatePhotoPreview = document.getElementById("newCandidatePhotoPreview");
  els.newCandidatePhotoPreviewImg = document.getElementById("newCandidatePhotoPreviewImg");
  els.clearPhotoBtn = document.getElementById("clearPhotoBtn");
  els.addCandidateBtn = document.getElementById("addCandidateBtn");

  els.logoUrlInput = document.getElementById("logoUrlInput");
  els.logoSaveBtn = document.getElementById("logoSaveBtn");
  els.logoPreview = document.getElementById("logoPreview");
  els.logoPreviewImg = document.getElementById("logoPreviewImg");
  els.logoUploadFile = document.getElementById("logoUploadFile");
  els.logoClearBtn = document.getElementById("logoClearBtn");
}

/* ---------------------------------------------------------------------------
   Login
   ------------------------------------------------------------------------ */
function showLoginScreen(errorMsg) {
  els.loginShell.style.display = "flex";
  els.dashShell.style.display = "none";
  if (errorMsg) {
    els.loginError.textContent = errorMsg;
    els.loginError.classList.add("show");
  }
}

function bindLogin() {
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.loginError.classList.remove("show");
    els.loginBtn.classList.add("is-loading");
    els.loginBtn.disabled = true;
    const attemptedEmail = els.loginEmail.value.trim();
    try {
      await auth.signInWithEmailAndPassword(attemptedEmail, els.loginPassword.value);
      await logAuditEvent("Admin login", ROLE, `Control admin signed in`);
    } catch (err) {
      els.loginError.textContent = friendlyAuthError(err);
      els.loginError.classList.add("show");
      await logAuditEvent(
        "Failed login attempt",
        ROLE,
        `Incorrect credentials for "${attemptedEmail || "(blank)"}" on Control Admin`,
        attemptedEmail || "(blank email)"
      );
    } finally {
      els.loginBtn.classList.remove("is-loading");
      els.loginBtn.disabled = false;
    }
  });

  els.logoutBtn.addEventListener("click", async () => {
    await logAuditEvent("Admin logout", ROLE, "Control admin signed out");
    await auth.signOut();
    showToast("Signed out.", "info");
  });
}

function friendlyAuthError(err) {
  const map = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  return map[err.code] || "Unable to sign in. Please try again.";
}

/* ---------------------------------------------------------------------------
   Dashboard
   ------------------------------------------------------------------------ */
let dashboardListenersAttached = false;

function showDashboard() {
  els.loginShell.style.display = "none";
  els.dashShell.style.display = "block";
  if (dashboardListenersAttached) return; // avoid stacking duplicate Firebase listeners
  dashboardListenersAttached = true;
  listenToData();
}

function listenToData() {
  db.ref(DB_PATHS.meta).on("value", (snap) => {
    currentMeta = snap.val() || {};
    renderMeta();
  });

  // The vote count shown here comes straight from the ballots themselves —
  // not a separate running counter — so it's always exactly accurate no
  // matter how many ballots come in or how concurrent the traffic is.
  db.ref(DB_PATHS.ballots).on("value", (snap) => {
    const count = snap.numChildren();
    els.voteCountValue.textContent = count.toLocaleString();
    updateTurnout(count);
  });

  db.ref(DB_PATHS.auditLogs).limitToLast(50).on("value", (snap) => {
    const val = snap.val() || {};
    const entries = Object.values(val).sort((a, b) => b.timestamp - a.timestamp);
    renderAuditLog(entries);
  });

  db.ref(DB_PATHS.positions).on("value", (snap) => {
    positionsData = snap.val() || {};
    renderManagePositions();
    renderManageCandidates();
  });

  db.ref(DB_PATHS.candidates).on("value", (snap) => {
    candidatesData = snap.val() || {};
    renderManageCandidates();
  });
}

function renderMeta() {
  const status = currentMeta.status || ELECTION_STATUS.NOT_STARTED;

  document.querySelectorAll("[data-school-name]").forEach((el) => (el.textContent = currentMeta.schoolName || "School Election"));
  if (currentMeta.logoUrl) applyBrandLogo(currentMeta.logoUrl);

  if (document.activeElement !== els.logoUrlInput) {
    els.logoUrlInput.value = currentMeta.logoUrl || "";
    updateLogoPreview(currentMeta.logoUrl || "");
  }

  els.statusBadge.className = `status-badge status-${status}`;
  els.statusBadge.innerHTML = `<span class="dot"></span>${statusLabel(status)}`;
  els.votingStatusValue.textContent = statusLabel(status);

  if (!eligibleInputFocused) {
    els.eligibleInput.value = currentMeta.totalEligibleVoters || "";
  }
  updateTurnout();

  // Button availability follows the election state machine
  els.startBtn.disabled = status === ELECTION_STATUS.ONGOING || status === ELECTION_STATUS.ENDED;
  els.nextVoterBtn.disabled = status !== ELECTION_STATUS.ONGOING;
  els.stopBtn.disabled = status !== ELECTION_STATUS.ONGOING;
  els.endBtn.disabled = status === ELECTION_STATUS.ENDED;
}

function updateTurnout(countOverride) {
  const count = countOverride ?? (parseInt(els.voteCountValue.textContent.replace(/,/g, ""), 10) || 0);
  const eligible = currentMeta.totalEligibleVoters || 0;
  if (!eligible) {
    els.turnoutValue.textContent = "—";
    return;
  }
  const pct = Math.min(100, (count / eligible) * 100);
  els.turnoutValue.textContent = `${pct.toFixed(1)}%`;
}

/* ---------------------------------------------------------------------------
   Eligible voter count (needed to compute turnout %)
   ------------------------------------------------------------------------ */
function bindEligibleField() {
  els.eligibleInput.addEventListener("focus", () => (eligibleInputFocused = true));
  els.eligibleInput.addEventListener("blur", () => (eligibleInputFocused = false));
  els.eligibleSaveBtn.addEventListener("click", async () => {
    const val = parseInt(els.eligibleInput.value, 10);
    if (isNaN(val) || val < 0) {
      showToast("Please enter a valid number of eligible voters.", "error");
      return;
    }
    await db.ref(`${DB_PATHS.meta}/totalEligibleVoters`).set(val);
    showToast("Eligible voter count updated.", "success");
  });
}

/* ---------------------------------------------------------------------------
   Election control actions
   ------------------------------------------------------------------------ */
function bindActions() {
  bindEligibleField();

  els.startBtn.addEventListener("click", async () => {
    setBtnLoading(els.startBtn, true);
    try {
      await db.ref(DB_PATHS.meta).update({
        status: ELECTION_STATUS.ONGOING,
        startedAt: Date.now()
      });
      await logAuditEvent("Voting started", ROLE);
      showToast("Voting is now open.", "success");
    } catch (err) {
      showToast("Could not start voting: " + err.message, "error");
    } finally {
      setBtnLoading(els.startBtn, false);
    }
  });

  els.nextVoterBtn.addEventListener("click", async () => {
    setBtnLoading(els.nextVoterBtn, true);
    try {
      // Bump a counter the voting kiosks listen for — this dismisses the
      // "Thank You" screen and shows a fresh ballot without pausing voting.
      await db.ref(`${DB_PATHS.meta}/voterCycle`).transaction((current) => (current || 0) + 1);
      await logAuditEvent("Advanced to next voter", ROLE);
      showToast("Voting PCs are ready for the next voter.", "success");
    } catch (err) {
      showToast("Could not advance to the next voter: " + err.message, "error");
    } finally {
      setBtnLoading(els.nextVoterBtn, false);
    }
  });

  els.stopBtn.addEventListener("click", async () => {
    setBtnLoading(els.stopBtn, true);
    try {
      await db.ref(DB_PATHS.meta).update({
        status: ELECTION_STATUS.STOPPED,
        stoppedAt: Date.now()
      });
      await logAuditEvent("Voting stopped", ROLE);
      showToast("Voting has been paused.", "info");
    } catch (err) {
      showToast("Could not stop voting: " + err.message, "error");
    } finally {
      setBtnLoading(els.stopBtn, false);
    }
  });

  els.endBtn.addEventListener("click", () => {
    showConfirmModal({
      title: "End the election?",
      message: "This permanently locks voting. Once ended, the election cannot be resumed — only reset, which erases all votes. Results will become available to the Results Admin. Enter the Results Admin password to confirm.",
      confirmText: "End Election",
      danger: true,
      requirePassword: true,
      passwordLabel: "Results Admin password",
      onConfirm: async (password) => {
        await verifyResultsAdminPassword(password);
        await db.ref(DB_PATHS.meta).update({
          status: ELECTION_STATUS.ENDED,
          endedAt: Date.now()
        });
        await logAuditEvent("Election ended", ROLE, "Confirmed with Results Admin password");
        showToast("The election has been ended.", "success");
      }
    });
  });

  els.resetBtn.addEventListener("click", () => {
    const suggestedName = `${currentMeta.electionTitle || "Election"} — ${formatDate(new Date())}`;
    showPromptModal({
      title: "Archive this election first?",
      message: "Before resetting, this election's results will be saved to the Election Archive so you don't lose the record. Give it a name (e.g. the year or election round).",
      placeholder: "e.g. Student Council Election 2025-26",
      defaultValue: suggestedName,
      confirmText: "Next: Confirm Reset",
      cancelText: "Cancel",
      onSubmit: async (archiveName) => {
        const finalName = archiveName || suggestedName;
        showConfirmModal({
          title: "Reset the entire election?",
          message: `"${escapeHTML(finalName)}" will be saved to the archive, then all submitted ballots will be permanently deleted and the election reset to Not Started. This cannot be undone. Enter the Results Admin password to confirm.`,
          confirmText: "Reset Election",
          danger: true,
          requireText: "RESET",
          requirePassword: true,
          passwordLabel: "Results Admin password",
          onConfirm: async (password) => {
            await verifyResultsAdminPassword(password);
            await archiveCurrentElection(finalName);
            await db.ref(DB_PATHS.ballots).remove();
            await db.ref(DB_PATHS.voteCount).set(0);
            await db.ref(DB_PATHS.meta).update({
              status: ELECTION_STATUS.NOT_STARTED,
              startedAt: null,
              stoppedAt: null,
              endedAt: null,
              voterCycle: 0
            });
            await logAuditEvent("Election reset", ROLE, `All ballots cleared — archived as "${finalName}" — confirmed with Results Admin password`);
            showToast("Election has been archived and reset.", "success");
          }
        });
      }
    });
  });
}

/* ---------------------------------------------------------------------------
   Results Admin password verification
   --------------------------------------------------------------------------
   End Election and Reset Election are destructive, so both require the
   Results Admin's password as a second factor before they run. We can't
   just call auth.signInWithEmailAndPassword() on THIS page's own auth
   instance to check it — that would replace the signed-in Control Admin
   session with the Results Admin one. Instead we spin up a throwaway,
   separately-named Firebase app instance purely to attempt the sign-in,
   then tear it down. That verifies the password without touching the
   Control Admin session in this tab at all. ---------------------------------- */
async function verifyResultsAdminPassword(password) {
  if (!password) {
    throw new Error("Enter the Results Admin password to continue.");
  }

  const snap = await db.ref(DB_PATHS.admins).orderByChild("role").equalTo("results").once("value");
  const resultsAdmins = snap.val() || {};
  const emails = Object.values(resultsAdmins)
    .map((a) => a && a.email)
    .filter(Boolean);

  if (!emails.length) {
    throw new Error("No Results Admin account is configured — cannot verify password.");
  }

  const tempAppName = `verify-results-${Date.now()}`;
  const tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
  const tempAuth = tempApp.auth();

  try {
    let verified = false;
    for (const email of emails) {
      try {
        await tempAuth.signInWithEmailAndPassword(email, password);
        verified = true;
        break;
      } catch (err) {
        // Wrong password for this particular Results Admin account — try
        // any others before giving up.
      }
    }
    if (!verified) {
      throw new Error("Incorrect Results Admin password.");
    }
  } finally {
    try { await tempAuth.signOut(); } catch (err) { /* ignore */ }
    try { await tempApp.delete(); } catch (err) { /* ignore */ }
  }
}

/* ---------------------------------------------------------------------------
   Historical elections archive
   --------------------------------------------------------------------------
   Snapshots the full election (meta, positions, candidates, ballots) under
   DB_PATHS.archive before Reset wipes the live data, so results can be
   reviewed or compared later from the Results Admin dashboard without
   needing to remember to export a CSV beforehand.
   ------------------------------------------------------------------------ */
async function archiveCurrentElection(name) {
  const [metaSnap, positionsSnap, candidatesSnap, ballotsSnap, voteCountSnap] = await Promise.all([
    db.ref(DB_PATHS.meta).once("value"),
    db.ref(DB_PATHS.positions).once("value"),
    db.ref(DB_PATHS.candidates).once("value"),
    db.ref(DB_PATHS.ballots).once("value"),
    db.ref(DB_PATHS.voteCount).once("value")
  ]);

  const meta = metaSnap.val() || {};
  const ballots = ballotsSnap.val() || {};

  const archiveEntry = {
    name: name || "Untitled Election",
    schoolName: meta.schoolName || "",
    electionTitle: meta.electionTitle || "",
    totalEligibleVoters: meta.totalEligibleVoters || 0,
    status: meta.status || ELECTION_STATUS.NOT_STARTED,
    startedAt: meta.startedAt || null,
    endedAt: meta.endedAt || null,
    archivedAt: Date.now(),
    totalBallots: Object.keys(ballots).length,
    voteCount: voteCountSnap.val() || 0,
    positions: positionsSnap.val() || {},
    candidates: candidatesSnap.val() || {},
    ballots
  };

  await db.ref(DB_PATHS.archive).push(archiveEntry);
}

function bindLogoField() {
  els.logoUrlInput.addEventListener("input", () => updateLogoPreview(els.logoUrlInput.value.trim()));

  els.logoUploadFile.addEventListener("change", async () => {
    const file = els.logoUploadFile.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 320, 0.85);
      els.logoUrlInput.value = dataUrl;
      updateLogoPreview(dataUrl);
      showToast("Logo loaded. Click Save Logo to apply it.", "info");
    } catch (err) {
      console.error(err);
      showToast("Could not read that image. Try a different file.", "error");
    } finally {
      els.logoUploadFile.value = "";
    }
  });

  els.logoClearBtn.addEventListener("click", () => {
    els.logoUrlInput.value = "";
    updateLogoPreview("");
  });

  els.logoSaveBtn.addEventListener("click", async () => {
    const url = els.logoUrlInput.value.trim();
    setBtnLoading(els.logoSaveBtn, true);
    try {
      await db.ref(`${DB_PATHS.meta}/logoUrl`).set(url || null);
      await logAuditEvent("Logo updated", ROLE, url ? "New logo set" : "Logo removed");
      showToast(url ? "Logo saved." : "Logo removed.", "success");
    } catch (err) {
      showToast("Could not save logo: " + err.message, "error");
    } finally {
      setBtnLoading(els.logoSaveBtn, false);
    }
  });
}

function updateLogoPreview(url) {
  if (!url) {
    els.logoPreview.style.display = "none";
    return;
  }
  els.logoPreviewImg.src = url;
  els.logoPreview.style.display = "flex";
}

/* ---------------------------------------------------------------------------
   Manage Positions & Candidates
   ------------------------------------------------------------------------ */
function renderManagePositions() {
  const list = Object.entries(positionsData)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Keep the "filter" and "add candidate" dropdowns in sync with positions
  const optionsHtml = list.map((p) => `<option value="${p.id}">${escapeHTML(p.title)}</option>`).join("");
  const prevFilter = els.candidateFilterSelect.value;
  const prevNewPos = els.newCandidatePosition.value;
  els.candidateFilterSelect.innerHTML = `<option value="">All positions</option>${optionsHtml}`;
  els.newCandidatePosition.innerHTML = optionsHtml || `<option value="" disabled selected>Add a position first</option>`;
  if (list.some((p) => p.id === prevFilter)) els.candidateFilterSelect.value = prevFilter;
  if (list.some((p) => p.id === prevNewPos)) els.newCandidatePosition.value = prevNewPos;

  if (!list.length) {
    els.positionsManageList.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No positions yet. Add one below.</p></div>`;
    return;
  }

  els.positionsManageList.innerHTML = list
    .map((p) => {
      const candidateCount = Object.values(candidatesData).filter((c) => c.positionId === p.id).length;
      return `
        <div class="manage-row">
          <div class="manage-row-info">
            <div class="manage-row-title">${escapeHTML(p.title)}</div>
            <div class="manage-row-sub">${candidateCount} candidate${candidateCount === 1 ? "" : "s"}</div>
          </div>
          <button type="button" class="manage-row-delete" data-position-id="${p.id}" data-position-title="${escapeHTML(p.title)}" ${candidateCount ? `disabled title="Remove its candidates first"` : ""}>
            ${ICONS.trash}
          </button>
        </div>`;
    })
    .join("");

  $all(".manage-row-delete", els.positionsManageList).forEach((btn) => {
    btn.addEventListener("click", () => deletePosition(btn.dataset.positionId, btn.dataset.positionTitle));
  });
}

function renderManageCandidates() {
  const filterId = els.candidateFilterSelect.value;
  const list = Object.entries(candidatesData)
    .map(([id, c]) => ({ id, ...c }))
    .filter((c) => !filterId || c.positionId === filterId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (!list.length) {
    els.candidatesManageList.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No candidates yet.</p></div>`;
    return;
  }

  els.candidatesManageList.innerHTML = list
    .map((c) => {
      const posTitle = (positionsData[c.positionId] && positionsData[c.positionId].title) || "Unknown position";
      const photo = c.photoUrl ? escapeHTML(c.photoUrl) : "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(c.name);
      return `
        <div class="manage-row">
          <img class="manage-row-photo" src="${photo}" alt="${escapeHTML(c.name)}" />
          <div class="manage-row-info">
            <div class="manage-row-title">${escapeHTML(c.name)}</div>
            <div class="manage-row-sub">${escapeHTML(posTitle)}</div>
          </div>
          <div class="manage-row-actions">
            <button type="button" class="manage-row-edit" data-candidate-id="${c.id}" title="Edit candidate">
              ${ICONS.edit}
            </button>
            <button type="button" class="manage-row-delete" data-candidate-id="${c.id}" data-candidate-name="${escapeHTML(c.name)}" title="Remove candidate">
              ${ICONS.trash}
            </button>
          </div>
        </div>`;
    })
    .join("");

  $all(".manage-row-delete", els.candidatesManageList).forEach((btn) => {
    btn.addEventListener("click", () => deleteCandidate(btn.dataset.candidateId, btn.dataset.candidateName));
  });

  $all(".manage-row-edit", els.candidatesManageList).forEach((btn) => {
    btn.addEventListener("click", () => openEditCandidateModal(btn.dataset.candidateId));
  });
}

/* ---------------------------------------------------------------------------
   Readable ID generation
   --------------------------------------------------------------------------
   db.ref(...).push() generates random keys like "-OwXyz123abc" — functional,
   but unreadable in the database view compared to the seed data's clean
   "pos_president" / "cand_001" style keys. This builds a similar readable
   key from the title/name instead, falling back to a short numeric suffix
   only if that key is somehow already taken.
   ------------------------------------------------------------------------ */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "item";
}

async function generateReadableId(basePath, prefix, label) {
  const base = `${prefix}_${slugify(label)}`;
  const existing = await db.ref(basePath).once("value");
  const existingKeys = new Set(Object.keys(existing.val() || {}));
  if (!existingKeys.has(base)) return base;
  let n = 2;
  while (existingKeys.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function bindManageForms() {
  els.addPositionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = els.newPositionTitle.value.trim();
    if (!title) return;
    setBtnLoading(els.addPositionBtn, true);
    try {
      const order = Object.keys(positionsData).length + 1;
      const positionId = await generateReadableId(DB_PATHS.positions, "pos", title);
      await db.ref(`${DB_PATHS.positions}/${positionId}`).set({ title, order });
      await logAuditEvent("Position added", ROLE, title);
      showToast(`"${title}" added as a position.`, "success");
      els.addPositionForm.reset();
    } catch (err) {
      showToast("Could not add position: " + err.message, "error");
    } finally {
      setBtnLoading(els.addPositionBtn, false);
    }
  });

  els.candidateFilterSelect.addEventListener("change", renderManageCandidates);

  els.newCandidatePhotoFile.addEventListener("change", async () => {
    const file = els.newCandidatePhotoFile.files[0];
    if (!file) return;
    try {
      selectedPhotoDataUrl = await resizeImageToDataUrl(file);
      els.newCandidatePhotoUrl.value = "";
      els.newCandidatePhotoPreviewImg.src = selectedPhotoDataUrl;
      els.newCandidatePhotoPreview.style.display = "flex";
    } catch (err) {
      console.error(err);
      showToast("Could not read that image. Try a different file.", "error");
    }
  });

  els.clearPhotoBtn.addEventListener("click", () => {
    selectedPhotoDataUrl = null;
    els.newCandidatePhotoFile.value = "";
    els.newCandidatePhotoPreview.style.display = "none";
  });

  els.addCandidateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = els.newCandidateName.value.trim();
    const positionId = els.newCandidatePosition.value;
    if (!name || !positionId) {
      showToast("Please enter a name and choose a position.", "error");
      return;
    }
    const photoUrl = selectedPhotoDataUrl || els.newCandidatePhotoUrl.value.trim();

    setBtnLoading(els.addCandidateBtn, true);
    try {
      const candidatesForPosition = Object.values(candidatesData).filter((c) => c.positionId === positionId);
      const order = candidatesForPosition.length + 1;
      const candidateId = await generateReadableId(DB_PATHS.candidates, "cand", name);
      await db.ref(`${DB_PATHS.candidates}/${candidateId}`).set({ name, positionId, photoUrl, order });
      await logAuditEvent("Candidate added", ROLE, `${name} (${(positionsData[positionId] || {}).title || ""})`);
      showToast(`${name} added.`, "success");
      els.addCandidateForm.reset();
      selectedPhotoDataUrl = null;
      els.newCandidatePhotoPreview.style.display = "none";
    } catch (err) {
      showToast("Could not add candidate: " + err.message, "error");
    } finally {
      setBtnLoading(els.addCandidateBtn, false);
    }
  });
}

function deletePosition(positionId, title) {
  showConfirmModal({
    title: "Remove this position?",
    message: `This removes "${title}" from the ballot.`,
    confirmText: "Remove Position",
    danger: true,
    onConfirm: async () => {
      await db.ref(`${DB_PATHS.positions}/${positionId}`).remove();
      await logAuditEvent("Position removed", ROLE, title);
      showToast("Position removed.", "success");
    }
  });
}

function deleteCandidate(candidateId, name) {
  showConfirmModal({
    title: "Remove this candidate?",
    message: `"${name}" will be removed from the ballot.`,
    confirmText: "Remove Candidate",
    danger: true,
    onConfirm: async () => {
      await db.ref(`${DB_PATHS.candidates}/${candidateId}`).remove();
      await logAuditEvent("Candidate removed", ROLE, name);
      showToast("Candidate removed.", "success");
    }
  });
}

/* ---- Edit Candidate modal ------------------------------------------------------
   Lets an admin update an existing candidate's name and/or photo without
   touching their position or vote history. */
function openEditCandidateModal(candidateId) {
  const candidate = candidatesData[candidateId];
  if (!candidate) return;

  let pendingPhoto = candidate.photoUrl || "";
  const currentPhotoDisplay = candidate.photoUrl || "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(candidate.name);

  let backdrop = document.getElementById("globalModalBackdrop");
  if (backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.id = "globalModalBackdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-box glass-card edit-candidate-modal">
      <h3>Edit Candidate</h3>
      <div class="field-group" style="text-align:left;">
        <label for="editCandidateName">Candidate Name</label>
        <input type="text" id="editCandidateName" value="${escapeHTML(candidate.name)}" />
      </div>
      <div class="field-group" style="text-align:left;">
        <label>Photo</label>
        <div class="photo-preview" style="display:flex; margin-bottom:10px;">
          <img id="editCandidatePhotoImg" src="${escapeHTML(currentPhotoDisplay)}" alt="${escapeHTML(candidate.name)}" />
          <button type="button" class="btn btn-ghost btn-sm" id="editCandidatePhotoRemoveBtn">Remove Photo</button>
        </div>
        <div class="photo-input-row">
          <label class="photo-upload-btn">
            Upload New Photo
            <input type="file" id="editCandidatePhotoFile" accept="image/*" hidden />
          </label>
          <span class="text-faint">or paste a URL</span>
        </div>
        <input type="text" id="editCandidatePhotoUrl" placeholder="https://..." style="margin-top:8px;" value="${candidate.photoUrl && !candidate.photoUrl.startsWith("data:") ? escapeHTML(candidate.photoUrl) : ""}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="editCandidateCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="editCandidateSaveBtn">
          <span class="btn-label">Save Changes</span><span class="spinner"></span>
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
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelector("#editCandidateCancelBtn").addEventListener("click", closeModal);

  const nameInput = backdrop.querySelector("#editCandidateName");
  const photoImg = backdrop.querySelector("#editCandidatePhotoImg");
  const photoUrlInput = backdrop.querySelector("#editCandidatePhotoUrl");
  const photoFileInput = backdrop.querySelector("#editCandidatePhotoFile");
  const removePhotoBtn = backdrop.querySelector("#editCandidatePhotoRemoveBtn");
  const saveBtn = backdrop.querySelector("#editCandidateSaveBtn");

  photoUrlInput.addEventListener("input", () => {
    pendingPhoto = photoUrlInput.value.trim();
    if (pendingPhoto) photoImg.src = pendingPhoto;
  });

  photoFileInput.addEventListener("change", async () => {
    const file = photoFileInput.files[0];
    if (!file) return;
    try {
      pendingPhoto = await resizeImageToDataUrl(file);
      photoUrlInput.value = "";
      photoImg.src = pendingPhoto;
    } catch (err) {
      console.error(err);
      showToast("Could not read that image. Try a different file.", "error");
    } finally {
      photoFileInput.value = "";
    }
  });

  removePhotoBtn.addEventListener("click", () => {
    pendingPhoto = "";
    photoUrlInput.value = "";
    photoImg.src = "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(nameInput.value.trim() || candidate.name);
  });

  saveBtn.addEventListener("click", async () => {
    const newName = nameInput.value.trim();
    if (!newName) {
      showToast("Candidate name can't be empty.", "error");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.classList.add("is-loading");
    try {
      await db.ref(`${DB_PATHS.candidates}/${candidateId}`).update({
        name: newName,
        photoUrl: pendingPhoto || ""
      });
      await logAuditEvent("Candidate edited", ROLE, newName);
      showToast("Candidate updated.", "success");
      closeModal();
    } catch (err) {
      showToast("Could not save changes: " + err.message, "error");
      saveBtn.disabled = false;
      saveBtn.classList.remove("is-loading");
    }
  });
}

/* Resize/compress an uploaded photo client-side and return it as a small
   base64 JPEG data URL. It's stored directly in the database alongside the
   candidate, so no separate file-storage setup or config is needed. */
function resizeImageToDataUrl(file, maxSize = 240, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setBtnLoading(btn, loading) {
  btn.classList.toggle("is-loading", loading);
  btn.disabled = loading;
}

/* ---------------------------------------------------------------------------
   Audit log rendering
   ------------------------------------------------------------------------ */
function bindAuditTabs() {
  $all(".audit-tab", els.auditTabs).forEach((btn) => {
    btn.addEventListener("click", () => {
      activeAuditCategory = btn.dataset.category;
      $all(".audit-tab", els.auditTabs).forEach((b) => b.classList.toggle("is-active", b === btn));
      renderAuditLog();
    });
  });
}

function renderAuditLog(entries) {
  if (entries) latestAuditEntries = entries;

  const filtered =
    activeAuditCategory === "all"
      ? latestAuditEntries
      : latestAuditEntries.filter((e) => getAuditCategory(e.action) === activeAuditCategory);

  if (!filtered.length) {
    els.auditBody.innerHTML = `<tr><td colspan="4"><div class="empty-state">${ICONS.list}<p>No activity in this category yet.</p></div></td></tr>`;
    return;
  }
  els.auditBody.innerHTML = filtered
    .map((e) => {
      const isWarning = e.action === "Failed login attempt";
      return `
    <tr class="${isWarning ? "audit-row-warning" : ""}">
      <td class="audit-action">${isWarning ? `<span class="audit-warning-icon">${ICONS.alert}</span>` : ""}${escapeHTML(e.action)}</td>
      <td><span class="audit-tag ${e.role}">${escapeHTML(e.role)}</span></td>
      <td>${escapeHTML(e.actor || "—")}${e.details ? ` <span class="text-faint">· ${escapeHTML(e.details)}</span>` : ""}</td>
      <td class="audit-time">${formatDateTime(e.timestamp)}</td>
    </tr>`;
    })
    .join("");
}
