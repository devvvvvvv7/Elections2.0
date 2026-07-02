/* ==========================================================================
   LANDING.JS — Landing page logic (index.html)
   ========================================================================== */

(function () {
  startLiveClock();

  // Live election status badge — public read, no auth required
  const statusBadge = document.getElementById("statusBadge");
  db.ref(DB_PATHS.meta).on("value", (snap) => {
    const meta = snap.val() || {};
    const status = meta.status || ELECTION_STATUS.NOT_STARTED;

    if (meta.schoolName) {
      document.querySelectorAll("[data-school-name]").forEach((el) => (el.textContent = meta.schoolName));
    }
    if (meta.electionTitle) {
      document.querySelectorAll("[data-election-title]").forEach((el) => (el.textContent = meta.electionTitle));
    }
    if (meta.logoUrl) applyBrandLogo(meta.logoUrl);

    statusBadge.className = `status-badge status-${status}`;
    statusBadge.innerHTML = `<span class="dot"></span>${statusLabel(status)}`;

    hideLoader();
  }, () => hideLoader());

  // Fallback in case the database is unreachable
  setTimeout(hideLoader, 4000);
})();
