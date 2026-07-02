/* ==========================================================================
   FIREBASE-CONFIG.JS
   --------------------------------------------------------------------------
   Replace the placeholder values below with YOUR Firebase project's web app
   configuration. You can find this in:
   Firebase Console → Project Settings → General → Your apps → SDK setup.

   This file must be loaded BEFORE any other app script, and AFTER the
   Firebase compat SDK <script> tags in every HTML page.
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyCxd0cOMfDD__MQXZDENe_VppWV_jzcMa0",
  authDomain: "sanmati-b04ec.firebaseapp.com",
  databaseURL: "https://sanmati-b04ec-default-rtdb.firebaseio.com",
  projectId: "sanmati-b04ec",
  storageBucket: "sanmati-b04ec.firebasestorage.app",
  messagingSenderId: "364547749129",
  appId: "1:364547749129:web:10b79a4d1ae1bb8aeccfd8",
  measurementId: "G-2MKQR3E11M"
};

// Initialize Firebase (compat SDK — works directly via <script> tags, no bundler needed)
//
// Each page gets its OWN named Firebase app instance instead of sharing the
// default one. Firebase Auth persists sessions per app-instance-name, so
// this lets Control Admin, Results Admin, and the voting kiosk all stay
// signed in at the same time, in the same browser — instead of one
// dashboard's login silently signing out the others (they used to share a
// single global session because they were all on the same "[DEFAULT]" app).
//
// Set window.FIREBASE_APP_NAME in a small inline <script> BEFORE this file
// loads on each HTML page (e.g. "control-admin", "results-admin", "voting").
// Pages that don't set it (like the public landing page, which never signs
// in) just use the shared default app — that's fine since there's no auth
// session there to isolate.
const appName = window.FIREBASE_APP_NAME;
const firebaseApp = appName
  ? firebase.initializeApp(firebaseConfig, appName)
  : firebase.initializeApp(firebaseConfig);

// Shared handles used across every page
const db = firebaseApp.database();
const auth = firebaseApp.auth();

// Keep admins signed in between visits (persists in the browser) — only the
// explicit Logout button should ever sign someone out.
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
  console.error("Could not set auth persistence:", err);
});

// Central database path constants — keep all paths consistent across files
const DB_PATHS = {
  meta: "election/meta",
  security: "election/security",
  positions: "election/positions",
  candidates: "election/candidates",
  ballots: "election/ballots",
  voteCount: "election/voteCount",
  auditLogs: "election/auditLogs",
  admins: "admins",
  archive: "election/archive"
};

// Election status enum — used everywhere to avoid typos
const ELECTION_STATUS = {
  NOT_STARTED: "not_started",
  ONGOING: "ongoing",
  STOPPED: "stopped",
  ENDED: "ended"
};
