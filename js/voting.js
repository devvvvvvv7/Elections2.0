/* ==========================================================================
   VOTING.JS — Voting PC kiosk logic (voting.html)
   --------------------------------------------------------------------------
   Flow:
   1. The PC authenticates ONCE via a staff-set PIN (no per-student login).
      Once authenticated, a flag is stored in localStorage so the kiosk opens
      straight to the ballot on every future load (per requirements).
   2. The ballot listens to the election status in real time and disables
      itself automatically when voting has not started / is paused / ended.
   3. Each submission is a single atomic "ballot" containing one selection
      per position — this prevents partial/incomplete submissions.
   ========================================================================== */

const PC_AUTH_KEY = "schoolElection_pcAuthenticated";

let currentMeta = {};
let positions = [];
let candidatesByPosition = {};
let selections = {}; // { positionId: candidateId }
let isSubmitting = false;
let lastStatus = null;
let lastVoterCycle = null;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  bindPinInputs();
  bindDeauth();

  // Every kiosk session signs in anonymously — this satisfies the
  // "Firebase Authentication" requirement for the voting terminal while
  // requiring no individual student login.
  //
  // Wait for Firebase to resolve whether a persisted anonymous session
  // already exists (LOCAL persistence) BEFORE calling signInAnonymously.
  // Calling it unconditionally on every load creates a brand-new anonymous
  // account each time if persistence hasn't finished resolving yet —
  // this is what causes the account pileup in Authentication → Users.
  auth.onAuthStateChanged((user) => {
    if (!user) {
      auth.signInAnonymously().catch((err) => {
        console.error("Anonymous auth failed:", err);
        showToast("Could not connect to the election server.", "error");
      });
      return; // signInAnonymously will trigger onAuthStateChanged again with a user
    }
    if (localStorage.getItem(PC_AUTH_KEY) === "true") {
      enterBallotMode();
    } else {
      els.pinScreen.style.display = "flex";
      hideLoader();
      els.pinDigits[0].focus();
    }
  });

  setTimeout(hideLoader, 4000);
});

function cacheEls() {
  els.pinScreen = document.getElementById("pinScreen");
  els.pinDigits = Array.from(document.querySelectorAll(".pin-digit"));
  els.pinSubmit = document.getElementById("pinSubmitBtn");
  els.pinError = document.getElementById("pinError");

  els.kioskShell = document.getElementById("kioskShell");
  els.ballotLocked = document.getElementById("ballotLocked");
  els.ballotWrap = document.getElementById("ballotWrap");
  els.positionsList = document.getElementById("positionsList");
  els.submitBtn = document.getElementById("submitVoteBtn");
  els.progressHint = document.getElementById("progressHint");

  els.successOverlay = document.getElementById("successOverlay");
  els.countdownText = document.getElementById("countdownText");

  els.lockIconWrap = document.getElementById("lockIconWrap");
  els.lockTitle = document.getElementById("lockTitle");
  els.lockMessage = document.getElementById("lockMessage");
}

/* ---------------------------------------------------------------------------
   PC PIN authentication
   ------------------------------------------------------------------------ */
function bindPinInputs() {
  els.pinDigits.forEach((input, idx) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (input.value && idx < els.pinDigits.length - 1) {
        els.pinDigits[idx + 1].focus();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        els.pinDigits[idx - 1].focus();
      }
      if (e.key === "Enter") submitPin();
    });
  });
  els.pinSubmit.addEventListener("click", submitPin);
}

async function submitPin() {
  const pin = els.pinDigits.map((d) => d.value).join("");
  els.pinError.classList.remove("show");

  if (pin.length !== els.pinDigits.length) {
    els.pinError.textContent = "Please enter the full PIN.";
    els.pinError.classList.add("show");
    return;
  }

  els.pinSubmit.classList.add("is-loading");
  els.pinSubmit.disabled = true;

  try {
    const snap = await db.ref(`${DB_PATHS.security}/pcPin`).once("value");
    const correctPin = snap.val();

    if (correctPin && pin === String(correctPin)) {
      localStorage.setItem(PC_AUTH_KEY, "true");
      showToast("Polling station authenticated.", "success");
      enterBallotMode();
    } else {
      els.pinError.textContent = "Incorrect PIN. Please ask an election official.";
      els.pinError.classList.add("show");
      els.pinDigits.forEach((d) => (d.value = ""));
      els.pinDigits[0].focus();
    }
  } catch (err) {
    console.error(err);
    els.pinError.textContent = "Unable to verify PIN right now. Check your connection.";
    els.pinError.classList.add("show");
  } finally {
    els.pinSubmit.classList.remove("is-loading");
    els.pinSubmit.disabled = false;
  }
}

function bindDeauth() {
  const link = document.getElementById("deauthBtn");
  if (!link) return;
  link.addEventListener("click", () => {
    showConfirmModal({
      title: "Reset this terminal?",
      message: "This will require an election official to re-enter the PC PIN before voting can resume on this device.",
      confirmText: "Reset Terminal",
      danger: true,
      onConfirm: () => {
        localStorage.removeItem(PC_AUTH_KEY);
        window.location.reload();
      }
    });
  });
}

/* ---------------------------------------------------------------------------
   Ballot mode — entered once the PC is authenticated
   ------------------------------------------------------------------------ */
function enterBallotMode() {
  els.pinScreen.style.display = "none";
  els.kioskShell.style.display = "flex";
  hideLoader();
  listenToElectionData();
}

function listenToElectionData() {
  db.ref(DB_PATHS.meta).on("value", (snap) => {
    currentMeta = snap.val() || {};
    document.querySelectorAll("[data-school-name]").forEach((el) => (el.textContent = currentMeta.schoolName || "School Election"));
    if (currentMeta.logoUrl) applyBrandLogo(currentMeta.logoUrl);
    renderGate();
  });

  db.ref(DB_PATHS.positions).on("value", (snap) => {
    const val = snap.val() || {};
    positions = Object.entries(val)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    renderBallot();
  });

  db.ref(DB_PATHS.candidates).on("value", (snap) => {
    const val = snap.val() || {};
    candidatesByPosition = {};
    Object.entries(val).forEach(([id, c]) => {
      if (!candidatesByPosition[c.positionId]) candidatesByPosition[c.positionId] = [];
      candidatesByPosition[c.positionId].push({ id, ...c });
    });
    Object.values(candidatesByPosition).forEach((list) => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    renderBallot();
  });
}

/* Decides whether to show the ballot or a "voting closed" gate screen */
function renderGate() {
  const status = currentMeta.status || ELECTION_STATUS.NOT_STARTED;
  const isOpen = status === ELECTION_STATUS.ONGOING;

  if (isOpen) {
    const voterCycle = currentMeta.voterCycle || 0;
    // Reset for a new voter when voting freshly (re)starts, or when the
    // control admin clicks "Allow Next Voter" while voting stays open.
    if (lastStatus !== ELECTION_STATUS.ONGOING || (lastVoterCycle !== null && voterCycle !== lastVoterCycle)) {
      resetBallot();
    }
    lastVoterCycle = voterCycle;
    els.ballotLocked.style.display = "none";
    els.ballotWrap.style.display = "block";
  } else {
    els.ballotWrap.style.display = "none";
    els.ballotLocked.style.display = "flex";
    const messages = {
      [ELECTION_STATUS.NOT_STARTED]: ["Voting Has Not Started", "Please wait for an election official to open the polls."],
      [ELECTION_STATUS.STOPPED]: ["Voting Is Paused", "Voting has been temporarily paused. Please wait for it to resume."],
      [ELECTION_STATUS.ENDED]: ["Election Has Ended", "Thank you for participating. Voting is now permanently closed."]
    };
    const [title, msg] = messages[status] || messages[ELECTION_STATUS.NOT_STARTED];
    els.lockTitle.textContent = title;
    els.lockMessage.textContent = msg;
  }

  lastStatus = status;
}

/* Renders the full ballot (positions + candidates) */
function renderBallot() {
  if (!positions.length) {
    els.positionsList.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No positions have been configured yet.</p></div>`;
    return;
  }

  els.positionsList.innerHTML = positions
    .map((pos, idx) => {
      const candidates = candidatesByPosition[pos.id] || [];
      return `
        <div class="position-block glass-card fade-up" style="animation-delay:${idx * 60}ms">
          <div class="position-title">
            <span class="position-index">${idx + 1}</span>
            <h2>${escapeHTML(pos.title)}</h2>
          </div>
          <div class="candidates-grid">
            ${candidates
              .map(
                (c) => `
              <label class="candidate-card" data-position="${pos.id}" data-candidate="${c.id}">
                <input type="radio" name="pos_${pos.id}" value="${c.id}" />
                <img class="candidate-photo" src="${c.photoUrl ? escapeHTML(c.photoUrl) : "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(c.name)}" alt="${escapeHTML(c.name)}" />
                <div class="candidate-name">${escapeHTML(c.name)}</div>
              </label>`
              )
              .join("")}
          </div>
        </div>`;
    })
    .join("");

  // Bind selection events
  $all(".candidate-card", els.positionsList).forEach((card) => {
    card.addEventListener("click", () => selectCandidate(card));
  });

  updateProgress();
}

function selectCandidate(card) {
  const positionId = card.dataset.position;
  const candidateId = card.dataset.candidate;
  selections[positionId] = candidateId;

  // Update visual state for this position's cards only
  $all(`.candidate-card[data-position="${positionId}"]`, els.positionsList).forEach((c) => {
    c.classList.toggle("selected", c.dataset.candidate === candidateId);
  });

  updateProgress();
}

function updateProgress() {
  const total = positions.length;
  const done = Object.keys(selections).filter((posId) => positions.some((p) => p.id === posId)).length;
  els.progressHint.textContent = `${done} of ${total} positions selected`;
  els.submitBtn.disabled = done < total || total === 0 || isSubmitting;
}

/* ---------------------------------------------------------------------------
   Vote submission
   ------------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("submitVoteBtn").addEventListener("click", openBallotConfirmation);
});

/* Shows a "You selected X for President, Y for Treasurer…" summary as a
   final check before the ballot is actually written to the database — this
   is purely a UI safety step; submitVote() below still does its own
   completeness/status re-validation exactly as before. */
function openBallotConfirmation() {
  if (isSubmitting) return;

  if (Object.keys(selections).length < positions.length || positions.length === 0) {
    showToast("Please make a selection for every position before submitting.", "error");
    return;
  }

  const summaryLines = positions.map((pos) => {
    const candidateId = selections[pos.id];
    const candidate = (candidatesByPosition[pos.id] || []).find((c) => c.id === candidateId);
    return `<strong>${escapeHTML(pos.title)}:</strong> ${escapeHTML(candidate ? candidate.name : "—")}`;
  });

  showConfirmModal({
    title: "Confirm Your Ballot",
    message: `${summaryLines.join("<br/>")}<br/><br/>Once submitted, your vote is final and cannot be changed. Please review your selections carefully before continuing.`,
    confirmText: "Confirm & Submit Vote",
    cancelText: "Go Back",
    danger: false,
    onConfirm: submitVote
  });
}

async function submitVote() {
  if (isSubmitting) return; // guard against duplicate clicks

  // Re-validate completeness (prevents incomplete ballot submission)
  if (Object.keys(selections).length < positions.length || positions.length === 0) {
    showToast("Please make a selection for every position before submitting.", "error");
    return;
  }

  // Re-validate election is still open (race condition guard)
  if ((currentMeta.status || ELECTION_STATUS.NOT_STARTED) !== ELECTION_STATUS.ONGOING) {
    showToast("Voting is not currently open.", "error");
    renderGate();
    return;
  }

  isSubmitting = true;
  const btn = els.submitBtn;
  btn.disabled = true;
  btn.classList.add("is-loading");

  try {
    // Write the ballot — this is the one write that actually counts as "a vote."
    // Once this succeeds, the vote is cast and must never be resubmitted.
    await db.ref(DB_PATHS.ballots).push({
      selections,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    // Increment the public "live count" display — best-effort only. If this
    // single number fails to update (e.g. a brief network hiccup under heavy
    // concurrent load), it does NOT mean the vote failed: the ballot above is
    // what results are actually tallied from. We must not send the voter back
    // to a fresh ballot in that case, since that risks a duplicate submission.
    db.ref(DB_PATHS.voteCount).transaction((current) => (current || 0) + 1).catch((err) => {
      console.warn("Live vote counter didn't update (display-only, vote was still recorded):", err);
    });

    showSuccessAndReset();
  } catch (err) {
    console.error(err);
    showToast("Your vote could not be submitted. Please try again or notify staff.", "error");
    btn.disabled = false;
    btn.classList.remove("is-loading");
    isSubmitting = false;
  }
}

function showSuccessAndReset() {
  els.successOverlay.classList.add("show");
  els.countdownText.textContent = "Please wait for an election official to call the next voter.";
}

function resetBallot() {
  selections = {};
  isSubmitting = false;
  els.successOverlay.classList.remove("show");
  els.submitBtn.classList.remove("is-loading");
  renderBallot();
}
