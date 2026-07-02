/* ==========================================================================
   RESULTS-ADMIN.JS — Results Admin dashboard logic (results-admin.html)
   --------------------------------------------------------------------------
   Responsibilities: secure login (role = "results"), display results ONLY
   after the election has ended, automatic vote counting & winner/tie
   detection, Chart.js visualizations, and official CSV export.
   This role has NO ability to start/stop/reset voting or edit votes.
   ========================================================================== */

const ROLE = "results";
let currentMeta = {};
let positions = [];
let candidatesByPosition = {};
let computedResults = []; // [{ position, candidates: [{...,votes,pct,isWinner}], totalVotes, isTie }]
let totalBallots = 0;
const charts = [];
let turnoutGaugeChart = null;

let rawPositions = {};
let rawCandidates = {};
let rawBallots = {};
let rawArchive = {};
const liveDataReady = { positions: false, candidates: false, ballots: false };
let latestAuditEntries = [];
let activeAuditCategory = "all";
let lastKnownStatus = null; // used to fire confetti only once, right when the election transitions to "ended"

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  bindLogin();
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
        showDashboard();
      } else {
        // Anonymous sessions (e.g. a voting.html kiosk tab open elsewhere on
        // the same origin) legitimately have no admins entry — that's
        // expected, not a misconfiguration, so don't warn about it.
        if (!user.isAnonymous) {
          console.warn(
            `[results-admin] No matching admins/${user.uid} entry with role "${ROLE}". ` +
            `Found: ${JSON.stringify(profile)}. Check Realtime Database → admins in the Firebase console.`
          );
        }
        // IMPORTANT: do NOT call auth.signOut() here. Firebase Auth sessions
        // are shared across every tab on this origin (Control Admin, Results
        // Admin, voting kiosk all share one session). Signing out here would
        // also kill a perfectly valid Control Admin session open in another
        // tab. Just show this dashboard's login screen and leave the shared
        // session alone — submitting the login form below will naturally
        // switch to a different account if needed.
        showLoginScreen(
          profile
            ? "This account is not authorized for Results Admin access."
            : "This account is not authorized for Results Admin access. (Signed in elsewhere as a different role? Just log in below with a Results Admin account.)"
        );
      }
    } catch (err) {
      // Most likely cause: security rules were never published in the Firebase
      // console (firebase-rules.json is just a reference file — it has to be
      // pasted into Database → Rules → Publish manually).
      console.error(`[results-admin] Failed to read admins/${user.uid}:`, err);
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
  els.logoutBtn = document.getElementById("logoutBtn");

  els.resultsLocked = document.getElementById("resultsLocked");
  els.resultsContent = document.getElementById("resultsContent");
  els.lockStatusBadge = document.getElementById("lockStatusBadge");
  els.liveBadge = document.getElementById("liveBadge");

  els.statTotalVotes = document.getElementById("statTotalVotes");
  els.statTurnout = document.getElementById("statTurnout");
  els.statPositions = document.getElementById("statPositions");
  els.statCandidates = document.getElementById("statCandidates");

  els.positionResults = document.getElementById("positionResults");
  els.resultsTableBody = document.getElementById("resultsTableBody");
  els.csvBtn = document.getElementById("downloadCsvBtn");
  els.pdfBtn = document.getElementById("downloadPdfBtn");
  els.posterBtn = document.getElementById("downloadPosterBtn");

  els.archiveList = document.getElementById("archiveList");

  els.winnersSpotlight = document.getElementById("winnersSpotlight");
  els.gaugeCanvas = document.getElementById("turnoutGaugeChart");
  els.gaugeCenterValue = document.getElementById("gaugeCenterValue");
  els.gaugeSub = document.getElementById("gaugeSub");

  els.auditBody = document.getElementById("auditTableBody");
  els.auditTabs = document.getElementById("auditTabs");
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
      await logAuditEvent("Admin login", ROLE, "Results admin signed in");
    } catch (err) {
      els.loginError.textContent = friendlyAuthError(err);
      els.loginError.classList.add("show");
      await logAuditEvent(
        "Failed login attempt",
        ROLE,
        `Incorrect credentials for "${attemptedEmail || "(blank)"}" on Results Admin`,
        attemptedEmail || "(blank email)"
      );
    } finally {
      els.loginBtn.classList.remove("is-loading");
      els.loginBtn.disabled = false;
    }
  });

  els.logoutBtn.addEventListener("click", async () => {
    await logAuditEvent("Admin logout", ROLE, "Results admin signed out");
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

  db.ref(DB_PATHS.meta).on("value", (snap) => {
    currentMeta = snap.val() || {};
    document.querySelectorAll("[data-school-name]").forEach((el) => (el.textContent = currentMeta.schoolName || "School Election"));
    if (currentMeta.logoUrl) applyBrandLogo(currentMeta.logoUrl);
    renderGate();
  });

  // Live listeners — results recompute automatically as votes come in
  db.ref(DB_PATHS.positions).on("value", (snap) => {
    rawPositions = snap.val() || {};
    liveDataReady.positions = true;
    computeAndRenderResults();
  });

  db.ref(DB_PATHS.candidates).on("value", (snap) => {
    rawCandidates = snap.val() || {};
    liveDataReady.candidates = true;
    computeAndRenderResults();
  });

  db.ref(DB_PATHS.ballots).on("value", (snap) => {
    rawBallots = snap.val() || {};
    liveDataReady.ballots = true;
    computeAndRenderResults();
  });

  db.ref(DB_PATHS.auditLogs).limitToLast(50).on("value", (snap) => {
    const val = snap.val() || {};
    const entries = Object.values(val).sort((a, b) => b.timestamp - a.timestamp);
    renderAuditLog(entries);
  });

  // Historical elections archive — populated whenever Control Admin resets
  // an election, so past results stay reviewable without needing a CSV
  // exported in advance.
  db.ref(DB_PATHS.archive).on("value", (snap) => {
    rawArchive = snap.val() || {};
    renderArchiveList();
  });

  els.csvBtn.addEventListener("click", downloadCsv);
  if (els.pdfBtn) els.pdfBtn.addEventListener("click", downloadPdf);
  if (els.posterBtn) els.posterBtn.addEventListener("click", downloadPoster);
}

/* Results are visible (live) as soon as voting has started; they only
   become "Final" once the Control Admin ends the election. */
function renderGate() {
  const status = currentMeta.status || ELECTION_STATUS.NOT_STARTED;
  const isLocked = status === ELECTION_STATUS.NOT_STARTED;

  // Celebrate the moment final results are revealed — but only once per
  // transition into "ended" (not on every re-render while already final).
  if (status === ELECTION_STATUS.ENDED && lastKnownStatus !== ELECTION_STATUS.ENDED) {
    if (typeof fireConfetti === "function") fireConfetti();
  }
  lastKnownStatus = status;

  if (isLocked) {
    els.resultsLocked.style.display = "flex";
    els.resultsContent.style.display = "none";
    els.lockStatusBadge.className = `status-badge status-${status}`;
    els.lockStatusBadge.innerHTML = `<span class="dot"></span>${statusLabel(status)}`;
  } else {
    els.resultsLocked.style.display = "none";
    els.resultsContent.style.display = "block";
    updateLiveBadge(status);
    computeAndRenderResults();
  }
}

function updateLiveBadge(status) {
  if (!els.liveBadge) return;
  const isFinal = status === ELECTION_STATUS.ENDED;
  els.liveBadge.className = `live-badge ${isFinal ? "is-final" : "is-live"}`;
  els.liveBadge.innerHTML = isFinal
    ? `<span class="dot"></span>Final results`
    : `<span class="dot pulse"></span>Live — updating in real time`;
}

/* ---------------------------------------------------------------------------
   Result computation — recomputes live from the cached realtime data every
   time meta, positions, candidates, or ballots change.
   ------------------------------------------------------------------------ */
/* Pure computation, factored out of computeAndRenderResults so the exact
   same winner/tie/percentage logic can also be reused to recompute results
   for an archived (past) election — without touching the live rendering
   path at all. Behavior/output for the live dashboard is unchanged. */
function computeResultsForData(rawPositionsIn, rawCandidatesIn, rawBallotsIn) {
  const positionsList = Object.entries(rawPositionsIn || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const byPosition = {};
  Object.entries(rawCandidatesIn || {}).forEach(([id, c]) => {
    if (!byPosition[c.positionId]) byPosition[c.positionId] = [];
    byPosition[c.positionId].push({ id, ...c, votes: 0 });
  });

  const ballotsList = Object.values(rawBallotsIn || {});

  const results = positionsList.map((pos) => {
    const candidates = (byPosition[pos.id] || []).map((c) => ({ ...c, votes: 0 }));
    ballotsList.forEach((ballot) => {
      const chosenId = ballot.selections && ballot.selections[pos.id];
      if (!chosenId) return;
      const cand = candidates.find((c) => c.id === chosenId);
      if (cand) cand.votes += 1;
    });

    const totalVotesForPosition = candidates.reduce((sum, c) => sum + c.votes, 0);
    const maxVotes = candidates.reduce((max, c) => Math.max(max, c.votes), 0);
    const winners = maxVotes > 0 ? candidates.filter((c) => c.votes === maxVotes) : [];

    candidates.forEach((c) => {
      c.pct = totalVotesForPosition ? (c.votes / totalVotesForPosition) * 100 : 0;
      c.isWinner = winners.includes(c);
    });
    candidates.sort((a, b) => b.votes - a.votes);

    return {
      position: pos,
      candidates,
      totalVotes: totalVotesForPosition,
      isTie: winners.length > 1
    };
  });

  return { positionsList, byPosition, results, totalBallots: ballotsList.length };
}

function computeAndRenderResults() {
  const status = currentMeta.status || ELECTION_STATUS.NOT_STARTED;
  if (status === ELECTION_STATUS.NOT_STARTED) return; // nothing to show yet
  if (!liveDataReady.positions || !liveDataReady.candidates || !liveDataReady.ballots) return;

  const computed = computeResultsForData(rawPositions, rawCandidates, rawBallots);
  positions = computed.positionsList;
  candidatesByPosition = computed.byPosition;
  computedResults = computed.results;
  totalBallots = computed.totalBallots;

  renderStats();
  renderTurnoutGauge();
  renderWinnersSpotlight();
  renderPositionResults();
  renderResultsTable();
}

function renderStats() {
  const eligible = currentMeta.totalEligibleVoters || 0;
  const turnout = eligible ? Math.min(100, (totalBallots / eligible) * 100) : null;
  const totalCandidates = Object.values(candidatesByPosition).reduce((sum, list) => sum + list.length, 0);

  els.statTotalVotes.textContent = totalBallots.toLocaleString();
  els.statTurnout.textContent = turnout === null ? "—" : `${turnout.toFixed(1)}%`;
  els.statPositions.textContent = positions.length;
  els.statCandidates.textContent = totalCandidates;
}

function renderTurnoutGauge() {
  const eligible = currentMeta.totalEligibleVoters || 0;
  const pct = eligible ? Math.min(100, (totalBallots / eligible) * 100) : 0;

  els.gaugeCenterValue.textContent = eligible ? `${pct.toFixed(1)}%` : "—";
  els.gaugeSub.textContent = eligible
    ? `${totalBallots.toLocaleString()} of ${eligible.toLocaleString()} eligible voters`
    : "Set the eligible voter count to see turnout";

  if (typeof Chart === "undefined") {
    console.warn("Chart.js did not load — skipping the turnout gauge chart (numbers above are still live).");
    return;
  }

  if (turnoutGaugeChart) turnoutGaugeChart.destroy();
  turnoutGaugeChart = new Chart(els.gaugeCanvas, {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: eligible ? [pct, 100 - pct] : [0, 1],
          backgroundColor: ["rgba(212,175,55,0.9)", "rgba(255,255,255,0.07)"],
          borderWidth: 0
        }
      ]
    },
    options: {
      cutout: "78%",
      rotation: -90,
      circumference: 360,
      responsive: true,
      maintainAspectRatio: false,
      animation: { animateRotate: true, duration: 900 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function renderWinnersSpotlight() {
  if (!computedResults.length) {
    els.winnersSpotlight.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No positions were configured for this election.</p></div>`;
    return;
  }

  els.winnersSpotlight.innerHTML = computedResults
    .map((r, idx) => {
      const winners = r.candidates.filter((c) => c.isWinner);
      if (!winners.length) {
        return `
          <div class="glass-card winner-spot-card fade-up" style="animation-delay:${idx * 50}ms">
            <div class="winner-spot-position">${escapeHTML(r.position.title)}</div>
            <div class="winner-spot-stats">No votes cast</div>
          </div>`;
      }
      const lead = winners[0];
      const isTie = r.isTie;
      const photo = lead.photoUrl ? escapeHTML(lead.photoUrl) : "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(lead.name);
      const nameLine = isTie ? winners.map((w) => escapeHTML(w.name)).join(" & ") : escapeHTML(lead.name);

      return `
        <div class="glass-card winner-spot-card fade-up ${isTie ? "is-tie" : ""}" style="animation-delay:${idx * 50}ms">
          <div class="winner-photo-ring" style="--pct:${lead.pct}">
            <img src="${photo}" alt="${escapeHTML(lead.name)}" />
          </div>
          <div class="winner-spot-position">${escapeHTML(r.position.title)}</div>
          <div class="winner-spot-name">${ICONS.crown}${nameLine}</div>
          <div class="winner-spot-stats">${lead.votes.toLocaleString()} votes${isTie ? " · Tie" : ` · ${lead.pct.toFixed(1)}%`}</div>
        </div>`;
    })
    .join("");
}

function renderPositionResults() {
  // Destroy any previous chart instances before re-rendering
  charts.forEach((c) => c.destroy());
  charts.length = 0;

  if (!computedResults.length) {
    els.positionResults.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No positions were configured for this election.</p></div>`;
    return;
  }

  els.positionResults.innerHTML = computedResults
    .map(
      (r, idx) => `
    <div class="glass-card position-result-card fade-up" style="animation-delay:${idx * 60}ms">
      <div class="pr-head">
        <h3>${escapeHTML(r.position.title)}</h3>
        <span class="pr-meta">${r.totalVotes.toLocaleString()} votes cast${r.isTie ? " · TIE" : ""}</span>
      </div>
      <div class="pr-body">
        <div class="pr-chart-wrap"><canvas id="chart_${r.position.id}"></canvas></div>
        <div class="cr-list">
          ${r.candidates
            .map(
              (c) => `
            <div class="candidate-result-row ${c.isWinner ? "is-winner" : ""}">
              <img src="${c.photoUrl ? escapeHTML(c.photoUrl) : "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(c.name)}" alt="${escapeHTML(c.name)}" />
              <div class="cr-info">
                <div class="cr-name">
                  ${escapeHTML(c.name)}
                  ${c.isWinner ? `<span class="winner-crown ${r.isTie ? "tie-badge" : ""}">${ICONS.crown}${r.isTie ? "Tie" : "Winner"}</span>` : ""}
                </div>
                <div class="cr-bar-track"><div class="cr-bar-fill" data-pct="${c.pct}"></div></div>
              </div>
              <div class="cr-votes">${c.votes}<span class="cr-pct"> · ${c.pct.toFixed(1)}%</span></div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    </div>`
    )
    .join("");

  // Animate bar fills on next frame
  requestAnimationFrame(() => {
    $all(".cr-bar-fill").forEach((el) => (el.style.width = `${el.dataset.pct}%`));
  });

  // Build Chart.js bar charts per position
  if (typeof Chart === "undefined") {
    console.warn("Chart.js did not load — skipping the per-position bar charts (results above are still live).");
    return;
  }
  computedResults.forEach((r) => {
    const ctx = document.getElementById(`chart_${r.position.id}`);
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: r.candidates.map((c) => c.name),
        datasets: [
          {
            label: "Votes",
            data: r.candidates.map((c) => c.votes),
            backgroundColor: r.candidates.map((c) => (c.isWinner ? "rgba(212,175,55,0.85)" : "rgba(255,255,255,0.18)")),
            borderRadius: 6,
            maxBarThickness: 46
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#121821", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1 } },
        scales: {
          x: { ticks: { color: "#9aa3af", font: { family: "Inter" } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: "#9aa3af", precision: 0 }, grid: { color: "rgba(255,255,255,0.06)" } }
        }
      }
    });
    charts.push(chart);
  });
}

function renderResultsTable() {
  const rows = [];
  computedResults.forEach((r) => {
    r.candidates.forEach((c) => {
      rows.push(`
        <tr>
          <td>${escapeHTML(r.position.title)}</td>
          <td>${escapeHTML(c.name)}</td>
          <td>${c.votes}</td>
          <td>${c.isWinner ? (r.isTie ? "Tie" : "Yes") : "No"}</td>
        </tr>`);
    });
  });
  els.resultsTableBody.innerHTML = rows.join("") || `<tr><td colspan="4"><div class="empty-state">No results to display.</div></td></tr>`;
}

/* ---------------------------------------------------------------------------
   CSV export — Position, Candidate, Votes, Winner, Timestamp
   ------------------------------------------------------------------------ */
function buildResultsCsv(results, generatedAt) {
  const header = ["Position", "Candidate", "Votes", "Winner", "Result Generated At"];
  const lines = [header.join(",")];

  results.forEach((r) => {
    r.candidates.forEach((c) => {
      const winnerLabel = c.isWinner ? (r.isTie ? "Tie" : "Yes") : "No";
      const row = [r.position.title, c.name, c.votes, winnerLabel, generatedAt].map(csvEscape);
      lines.push(row.join(","));
    });
  });

  return lines.join("\n");
}

function triggerFileDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv() {
  const generatedAt = formatDateTime(Date.now());
  const csv = buildResultsCsv(computedResults, generatedAt);
  triggerFileDownload(csv, `election-results-${Date.now()}.csv`, "text/csv;charset=utf-8;");

  logAuditEvent("CSV downloaded", ROLE, "Official results CSV exported");
  showToast("Official results CSV downloaded.", "success");
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function slugify(str) {
  return (str || "election").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "election";
}

/* ---------------------------------------------------------------------------
   PDF export — a formal, printable results report for handing to school
   administration or posting publicly. Built with jsPDF + AutoTable (loaded
   via CDN in results-admin.html). Parameterized so it can render either the
   live/current election or any archived election snapshot.
   ------------------------------------------------------------------------ */
function buildAndDownloadResultsPdf(options) {
  const {
    schoolName,
    electionTitle,
    results,
    totalBallots: ballotCount,
    eligibleVoters,
    isFinal,
    endedAt,
    filenamePrefix
  } = options;

  if (typeof window.jspdf === "undefined") {
    showToast("The PDF library did not load. Check your connection and try again.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 42;
  const dark = [22, 26, 33];
  const gold = [163, 122, 26];
  const grayText = [100, 108, 120];
  const displaySchool = schoolName || "Sanmati Higher Secondary School";

  // ---- Header band ----
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(displaySchool, pageWidth / 2, 34, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(230, 205, 140);
  doc.text("OFFICIAL ELECTION RESULTS REPORT", pageWidth / 2, 53, { align: "center" });
  doc.setFontSize(9.5);
  doc.setTextColor(205, 208, 214);
  doc.text(electionTitle || "Student Council Election", pageWidth / 2, 70, { align: "center" });

  let y = 116;
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(
    isFinal ? "STATUS: FINAL RESULTS — ELECTION ENDED" : "STATUS: PRELIMINARY / LIVE RESULTS (NOT FINAL)",
    marginX,
    y
  );
  y += 16;

  const turnoutPct = eligibleVoters ? `${Math.min(100, (ballotCount / eligibleVoters) * 100).toFixed(1)}%` : "—";
  const metaRows = [
    ["Total Votes Cast", ballotCount.toLocaleString()],
    ["Eligible Voters", eligibleVoters ? eligibleVoters.toLocaleString() : "—"],
    ["Voter Turnout", turnoutPct],
    ["Election Ended At", endedAt ? formatDateTime(endedAt) : "—"],
    ["Report Generated At", formatDateTime(Date.now())]
  ];

  doc.autoTable({
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 3, textColor: dark },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 150 } },
    body: metaRows
  });

  y = doc.lastAutoTable.finalY + 20;

  results.forEach((r) => {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...dark);
    doc.text(r.position.title, marginX, y);

    const body = r.candidates.map((c) => [
      c.name,
      c.votes.toString(),
      `${c.pct.toFixed(1)}%`,
      c.isWinner ? (r.isTie ? "Tie" : "Winner") : ""
    ]);

    doc.autoTable({
      startY: y + 8,
      margin: { left: marginX, right: marginX },
      head: [["Candidate", "Votes", "Percentage", "Result"]],
      body,
      theme: "grid",
      headStyles: { fillColor: dark, textColor: 255, fontSize: 9.5 },
      styles: { fontSize: 9.5, cellPadding: 5, textColor: dark },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3 && data.cell.raw) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = gold;
        }
      }
    });

    y = doc.lastAutoTable.finalY + 10;

    const winners = r.candidates.filter((c) => c.isWinner);
    let winnerLine = "No votes cast for this position.";
    if (winners.length === 1) {
      winnerLine = `Winner declared: ${winners[0].name} — ${winners[0].votes} votes (${winners[0].pct.toFixed(1)}%)`;
    } else if (winners.length > 1) {
      winnerLine = `Result: Tie between ${winners.map((w) => w.name).join(" & ")}`;
    }

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(...grayText);
    doc.text(winnerLine, marginX, y);
    y += 28;
  });

  // ---- Footer on every page ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, h - 42, pageWidth - marginX, h - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...grayText);
    doc.text(`${displaySchool} — Official Election Document`, marginX, h - 28);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginX, h - 28, { align: "right" });
  }

  const safeName = slugify(filenamePrefix || "election-results");
  doc.save(`${safeName}-${Date.now()}.pdf`);
}

function downloadPdf() {
  const eligible = currentMeta.totalEligibleVoters || 0;
  const isFinal = (currentMeta.status || ELECTION_STATUS.NOT_STARTED) === ELECTION_STATUS.ENDED;

  buildAndDownloadResultsPdf({
    schoolName: currentMeta.schoolName || "Sanmati Higher Secondary School",
    electionTitle: currentMeta.electionTitle || "Student Council Election",
    results: computedResults,
    totalBallots,
    eligibleVoters: eligible,
    isFinal,
    endedAt: currentMeta.endedAt || null,
    filenamePrefix: "election-results"
  });

  logAuditEvent("PDF downloaded", ROLE, "Official results PDF exported");
  showToast("Official results PDF downloaded.", "success");
}

/* ---------------------------------------------------------------------------
   Winner poster — a single celebratory, postable page announcing ONLY the
   President and Prime Minister winners (name + photo), not every position.
   Built with jsPDF, same color theme as the results report above, but
   designed to be printed and pinned on a notice board.
   ------------------------------------------------------------------------ */

// Position titles this poster applies to. Matches "School President",
// "President", "Prime Minister", etc. — case-insensitive, wording-tolerant.
const POSTER_POSITION_PATTERN = /president|prime\s*minister/i;

// Loads an image URL, crops it to a square, and returns a PNG data URL that
// jsPDF can embed. Resolves to null (instead of throwing) if the image can't
// be loaded or the canvas is tainted by a cross-origin source without CORS,
// so the poster can gracefully fall back to an initials badge.
function loadImageAsSquarePng(url, size = 500) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const ratio = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const w = img.naturalWidth * ratio;
        const h = img.naturalHeight * ratio;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Draws a PNG data URL clipped to a circle at (cx, cy) with radius r, then
// rings it with a gold border matching the poster theme.
function drawCircularPhoto(doc, dataUrl, cx, cy, r, ringColor) {
  doc.saveGraphicsState();
  doc.circle(cx, cy, r, "S");
  doc.clip();
  doc.discardPath();
  doc.addImage(dataUrl, "PNG", cx - r, cy - r, r * 2, r * 2);
  doc.restoreGraphicsState();
  doc.setDrawColor(...ringColor);
  doc.setLineWidth(2.2);
  doc.circle(cx, cy, r, "S");
}

// Draws a filled circle with the winner's initials as a fallback when no
// usable photo is available.
function drawInitialsBadge(doc, name, cx, cy, r, fillColor, textColor) {
  doc.setFillColor(...fillColor);
  doc.circle(cx, cy, r, "F");
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  doc.setTextColor(...textColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(r * 0.75);
  doc.text(initials, cx, cy + r * 0.28, { align: "center" });
}

async function buildAndDownloadWinnerPoster(options) {
  const { schoolName, electionTitle, results, totalBallots: ballotCount, eligibleVoters, isFinal, filenamePrefix } = options;

  if (typeof window.jspdf === "undefined") {
    showToast("The PDF library did not load. Check your connection and try again.", "error");
    return false;
  }

  // The poster only covers the President and Prime Minister positions —
  // filter everything else out before drawing anything.
  const posterResults = (results || []).filter((r) => POSTER_POSITION_PATTERN.test(r.position?.title || ""));

  if (!posterResults.length) {
    showToast('No "President" or "Prime Minister" position was found. Rename a position to include that title to use the poster.', "error");
    return false;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dark = [22, 26, 33];
  const gold = [212, 175, 90];
  const cream = [244, 240, 230];
  const displaySchool = schoolName || "Sanmati Higher Secondary School";

  // Preload each winner's photo (first winner per position) as a square PNG
  // before drawing, since jsPDF's addImage needs the data synchronously.
  const photoDataUrls = await Promise.all(
    posterResults.map((r) => {
      const lead = r.candidates.find((c) => c.isWinner);
      if (!lead) return Promise.resolve(null);
      const url = lead.photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(lead.name)}`;
      return loadImageAsSquarePng(url);
    })
  );

  // ---- Full-bleed dark background ----
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // ---- Gold rule frame ----
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.rect(28, 28, pageWidth - 56, pageHeight - 56);

  let y = 90;
  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(displaySchool.toUpperCase(), pageWidth / 2, y, { align: "center" });

  y += 34;
  doc.setTextColor(...cream);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("ELECTION RESULTS", pageWidth / 2, y, { align: "center" });

  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.setTextColor(...gold);
  doc.text(electionTitle || "Student Council Election", pageWidth / 2, y, { align: "center" });

  if (!isFinal) {
    y += 18;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(200, 90, 90);
    doc.text("PRELIMINARY — RESULTS NOT YET FINAL", pageWidth / 2, y, { align: "center" });
  }

  y += 26;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 - 90, y, pageWidth / 2 + 90, y);
  y += 40;

  // ---- One photo + winner block per matched position (President / PM),
  //      evenly spaced down the page ----
  const usableTop = y;
  const usableBottom = pageHeight - 110;
  const blockHeight = usableBottom - usableTop > 0 ? (usableBottom - usableTop) / posterResults.length : 0;
  const photoRadius = Math.max(46, Math.min(92, blockHeight / 2 - 56));

  posterResults.forEach((r, idx) => {
    const blockCenterY = usableTop + idx * blockHeight + blockHeight / 2;
    const winners = r.candidates.filter((c) => c.isWinner);
    const photoCy = blockCenterY - (blockHeight > 260 ? 40 : 10);
    const lead = winners[0];

    if (lead) {
      if (photoDataUrls[idx]) {
        drawCircularPhoto(doc, photoDataUrls[idx], pageWidth / 2, photoCy, photoRadius, gold);
      } else {
        drawInitialsBadge(doc, lead.name, pageWidth / 2, photoCy, photoRadius, gold, dark);
      }
    }

    const textTop = photoCy + photoRadius + 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...gold);
    doc.text((r.position.title || "").toUpperCase(), pageWidth / 2, textTop, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...cream);
    const nameLine = winners.length === 0
      ? "No votes cast"
      : winners.map((w) => w.name).join("  &  ");
    doc.text(nameLine, pageWidth / 2, textTop + 28, { align: "center" });

    if (winners.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(150, 155, 165);
      const sub = winners.length > 1
        ? "Result: Tie"
        : `${winners[0].votes} votes · ${winners[0].pct.toFixed(1)}%`;
      doc.text(sub, pageWidth / 2, textTop + 46, { align: "center" });
    }
  });

  // ---- Footer stats ----
  const turnoutPct = eligibleVoters ? `${Math.min(100, (ballotCount / eligibleVoters) * 100).toFixed(1)}%` : "—";
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.6);
  doc.line(60, pageHeight - 78, pageWidth - 60, pageHeight - 78);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...gold);
  doc.text(
    `${ballotCount.toLocaleString()} votes cast   ·   Turnout ${turnoutPct}   ·   ${formatDateTime(Date.now())}`,
    pageWidth / 2,
    pageHeight - 58,
    { align: "center" }
  );

  const safeName = slugify(filenamePrefix || "winner-poster");
  doc.save(`${safeName}-${Date.now()}.pdf`);
  return true;
}

async function downloadPoster() {
  const eligible = currentMeta.totalEligibleVoters || 0;
  const isFinal = (currentMeta.status || ELECTION_STATUS.NOT_STARTED) === ELECTION_STATUS.ENDED;

  const ok = await buildAndDownloadWinnerPoster({
    schoolName: currentMeta.schoolName || "Sanmati Higher Secondary School",
    electionTitle: currentMeta.electionTitle || "Student Council Election",
    results: computedResults,
    totalBallots,
    eligibleVoters: eligible,
    isFinal,
    filenamePrefix: "winner-poster"
  });
  if (!ok) return;

  logAuditEvent("Poster downloaded", ROLE, "Winner announcement poster exported");
  showToast("Winner poster downloaded.", "success");
}

/* ---------------------------------------------------------------------------
   Historical elections archive
   --------------------------------------------------------------------------
   Reads snapshots written by Control Admin's Reset flow (DB_PATHS.archive)
   so past elections can be reviewed or compared, and re-exported as CSV/PDF,
   without anyone needing to remember to export before a reset.
   ------------------------------------------------------------------------ */
function renderArchiveList() {
  if (!els.archiveList) return;

  const entries = Object.entries(rawArchive).sort((a, b) => (b[1].archivedAt || 0) - (a[1].archivedAt || 0));

  if (!entries.length) {
    els.archiveList.innerHTML = `<div class="empty-state">${ICONS.empty}<p>No past elections archived yet. When Control Admin resets an election, a snapshot is saved here automatically.</p></div>`;
    return;
  }

  els.archiveList.innerHTML = entries
    .map(([id, entry]) => {
      const eligible = entry.totalEligibleVoters || 0;
      const votes = entry.totalBallots || 0;
      const turnout = eligible ? `${Math.min(100, (votes / eligible) * 100).toFixed(1)}%` : "—";
      return `
      <div class="manage-row archive-row">
        <div class="manage-row-info">
          <div class="manage-row-title">${escapeHTML(entry.name || "Untitled Election")}</div>
          <div class="manage-row-sub">Archived ${formatDateTime(entry.archivedAt)} · ${votes.toLocaleString()} votes · Turnout ${turnout}</div>
        </div>
        <div class="manage-row-actions">
          <button type="button" class="btn btn-ghost btn-sm archive-view-btn" data-archive-id="${id}">View Results</button>
        </div>
      </div>`;
    })
    .join("");

  $all(".archive-view-btn", els.archiveList).forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = rawArchive[btn.dataset.archiveId];
      if (entry) openArchiveDetailModal(entry);
    });
  });
}

function openArchiveDetailModal(entry) {
  const computed = computeResultsForData(entry.positions, entry.candidates, entry.ballots);
  const eligible = entry.totalEligibleVoters || 0;
  const turnout = eligible ? `${Math.min(100, (computed.totalBallots / eligible) * 100).toFixed(1)}%` : "—";

  const rowsHtml = computed.results
    .map(
      (r) => `
      <tr><td colspan="4" class="archive-position-head">${escapeHTML(r.position.title)}${r.isTie ? " · TIE" : ""}</td></tr>
      ${r.candidates
        .map(
          (c) => `
        <tr>
          <td>${escapeHTML(c.name)}</td>
          <td>${c.votes}</td>
          <td>${c.pct.toFixed(1)}%</td>
          <td>${c.isWinner ? (r.isTie ? "Tie" : "Winner") : "—"}</td>
        </tr>`
        )
        .join("")}`
    )
    .join("");

  let backdrop = document.getElementById("globalModalBackdrop");
  if (backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.id = "globalModalBackdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-box glass-card archive-detail-modal">
      <h3>${escapeHTML(entry.name || "Archived Election")}</h3>
      <p class="text-faint archive-detail-sub">
        Archived ${formatDateTime(entry.archivedAt)} · ${computed.totalBallots.toLocaleString()} votes · Turnout ${turnout}
      </p>
      <div class="audit-log-scroll archive-detail-scroll">
        <table class="results-table">
          <thead><tr><th>Candidate</th><th>Votes</th><th>%</th><th>Result</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="4">No positions were recorded for this election.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="archiveDetailCloseBtn">Close</button>
        <button class="btn btn-ghost" id="archiveDetailCsvBtn">Download CSV</button>
        <button class="btn btn-primary" id="archiveDetailPdfBtn">Download PDF</button>
        <button class="btn btn-primary" id="archiveDetailPosterBtn">Download Poster</button>
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
  backdrop.querySelector("#archiveDetailCloseBtn").addEventListener("click", closeModal);

  backdrop.querySelector("#archiveDetailCsvBtn").addEventListener("click", () => {
    const generatedAt = formatDateTime(Date.now());
    const csv = buildResultsCsv(computed.results, generatedAt);
    triggerFileDownload(csv, `election-results-${slugify(entry.name)}-${entry.archivedAt}.csv`, "text/csv;charset=utf-8;");
    logAuditEvent("CSV downloaded", ROLE, `Archived results exported: "${entry.name}"`);
    showToast("Archived results CSV downloaded.", "success");
  });

  backdrop.querySelector("#archiveDetailPdfBtn").addEventListener("click", () => {
    buildAndDownloadResultsPdf({
      schoolName: entry.schoolName || currentMeta.schoolName || "Sanmati Higher Secondary School",
      electionTitle: entry.name || entry.electionTitle || "Archived Election",
      results: computed.results,
      totalBallots: computed.totalBallots,
      eligibleVoters: entry.totalEligibleVoters || 0,
      isFinal: true,
      endedAt: entry.endedAt || entry.archivedAt,
      filenamePrefix: `election-results-${slugify(entry.name)}`
    });
    logAuditEvent("PDF downloaded", ROLE, `Archived results exported: "${entry.name}"`);
    showToast("Archived results PDF downloaded.", "success");
  });

  backdrop.querySelector("#archiveDetailPosterBtn").addEventListener("click", async () => {
    const ok = await buildAndDownloadWinnerPoster({
      schoolName: entry.schoolName || currentMeta.schoolName || "Sanmati Higher Secondary School",
      electionTitle: entry.name || entry.electionTitle || "Archived Election",
      results: computed.results,
      totalBallots: computed.totalBallots,
      eligibleVoters: entry.totalEligibleVoters || 0,
      isFinal: true,
      filenamePrefix: `winner-poster-${slugify(entry.name)}`
    });
    if (!ok) return;
    logAuditEvent("Poster downloaded", ROLE, `Archived winner poster exported: "${entry.name}"`);
    showToast("Winner poster downloaded.", "success");
  });
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
