# School Election Management System

> **What's new:** Historical Elections Archive (auto-saved on Reset), a ballot confirmation screen before final submit, and an official downloadable PDF results report. See [Recent additions](#-recent-additions) below.

A complete, production-ready, real-time election management website for schools — built with vanilla HTML, CSS and JavaScript, backed by Firebase Realtime Database and Firebase Authentication. Designed to be hosted for free on GitHub Pages.

---

## ✨ Features

- **Landing Page** — school branding, live election status, and three portals (Voting PC, Control Admin, Results Admin)
- **Voting PC (kiosk)** — one-time PC authentication via PIN, no student login, live ballot with photo/name/radio candidate cards, duplicate-click protection, incomplete-ballot protection, success animation, auto-reset after 5 seconds
- **Control Admin** — Start / Stop / End / Reset the election, live voter count, live status, audit log, confirmation dialogs for destructive actions — **cannot** see results or download data
- **Results Admin** — results unlock only after the election ends, automatic vote counting & winner/tie detection, Chart.js visualizations, turnout %, official CSV export, audit log — **cannot** start/stop/reset voting
- Premium dark glassmorphism UI, smooth animations, fully responsive (desktop/laptop/tablet)
- Real-time updates everywhere via Firebase Realtime Database listeners — no page refreshes
- Firebase Security Rules enforce every permission boundary server-side (not just in the UI)

## 🆕 Recent additions

**Historical elections archive** — Resetting the election no longer just wipes everything. Control Admin's Reset flow now first asks for a name for the current election (e.g. "Student Council 2025-26"), snapshots the full result set (positions, candidates, every ballot, turnout) to `election/archive` in the database, *then* performs the exact same wipe as before. Results Admin has a new **Election Archive** section listing every past election — click **View Results** to see a recomputed results table for that year, or export that specific archived election as CSV or PDF independently of the current live election. Nothing about how Start/Stop/End/Reset behave for the *current* election has changed — this only adds a save-before-wipe step.

**Ballot confirmation screen** — On the Voting PC, tapping "Submit Vote" no longer submits immediately. A summary screen appears first ("President: Aanya Sharma, Treasurer: Kabir Singh…") with **Confirm & Submit Vote** / **Go Back** options, so a student can catch a mis-click before it's locked in. The actual vote-writing logic (atomic ballot write, duplicate-submission guard, election-still-open re-check) is unchanged — the confirmation is purely an extra step before that logic runs.

**Official PDF results report** — Results Admin can now download a formal, printable **PDF results report** in addition to the CSV export, generated client-side with jsPDF. It includes the school name and election title in a title header, a status line (Final vs Preliminary/Live), total votes/turnout/eligible-voter figures, a per-position table of every candidate's votes and percentage, an explicit winner (or tie) declaration for each position, and a generated-at timestamp — formatted to be suitable for handing to school administration or posting publicly. Archived elections can generate the same report from their saved snapshot.

---



```
school-election/
├── index.html              Landing page
├── voting.html              Voting PC kiosk
├── control-admin.html       Control Admin dashboard
├── results-admin.html       Results Admin dashboard
├── css/
│   ├── base.css              Design tokens, reset, shared components
│   ├── landing.css
│   ├── voting.css
│   ├── admin.css             Shared by both admin dashboards
│   └── results.css
├── js/
│   ├── firebase-config.js    ⚠️ Fill in your Firebase project credentials here
│   ├── utils.js               Toasts, modals, loader, icons, formatting helpers
│   ├── landing.js
│   ├── voting.js
│   ├── control-admin.js
│   └── results-admin.js
├── firebase-rules.json       Realtime Database security rules
├── seed-data.json            Sample positions & candidates to import
└── README.md
```

---

## 🔧 1. Create your Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. **Add a Web App** (the `</>` icon) and copy the `firebaseConfig` object it gives you.
3. Open `js/firebase-config.js` in this project and replace the placeholder values with your real config:

```js
const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

> If you don't see a `databaseURL`, create a Realtime Database first (step 2) — the URL appears once it exists.

---

## 🗄️ 2. Set up Realtime Database

1. In the Firebase Console, go to **Build → Realtime Database → Create Database**.
2. Choose a region and start in **locked mode** (we will paste our own rules next).
3. Open the **Rules** tab and paste the entire contents of `firebase-rules.json` from this project, then **Publish**.
4. Open the **Data** tab, click the three-dot menu → **Import JSON**, and import `seed-data.json`. This creates:
   - `election/meta` — school name, election title, status, eligible voter count
   - `election/security/pcPin` — the PIN Voting PCs must enter once (default `2468` — **change this**)
   - `election/positions` and `election/candidates` — sample positions/candidates (edit names, photo URLs, and add/remove as needed directly in the console)

> Candidate photos: set `photoUrl` to any public image URL. If left blank, a clean auto-generated initials avatar is shown instead.

---

## 🔐 3. Set up Authentication

1. Go to **Build → Authentication → Sign-in method** and enable:
   - **Email/Password**
   - **Anonymous** (used only by Voting PCs — no personal data is ever collected from students)
2. Go to the **Users** tab and **Add user** for each admin you need, e.g.:
   - `control@school.edu` — Control Admin
   - `results@school.edu` — Results Admin
3. Copy each new user's **User UID** from the Users table.
4. Go back to **Realtime Database → Data** and manually add entries under `admins`:

```json
"admins": {
  "<control-admin-uid>": { "email": "control@school.edu", "role": "control" },
  "<results-admin-uid>": { "email": "results@school.edu", "role": "results" }
}
```

This `role` field is what the security rules and the app use to separate Control Admin and Results Admin permissions — without an entry here, login will be rejected even with correct credentials.

---

## 🚀 4. Deploy to GitHub Pages

1. Push this folder to a GitHub repository (the `school-election` folder should be your repo root, or adjust paths accordingly).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select your branch (e.g. `main`) and root folder, then **Save**.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

No build step is required — everything is static HTML/CSS/JS with Firebase loaded from CDN.

---

## 🗳️ How the election flow works

| Status | Meaning | Voting PC | Results Admin |
|---|---|---|---|
| `not_started` | Default state | Shows "Voting Has Not Started" | Locked |
| `ongoing` | Started by Control Admin | Ballot is live | Locked |
| `stopped` | Paused by Control Admin | Shows "Voting Is Paused" | Locked |
| `ended` | Ended by Control Admin | Permanently shows "Election Has Ended" | **Unlocked** |

- **Start Voting** → status becomes `ongoing` instantly on every open Voting PC (real-time listener, no refresh needed).
- **Stop Voting** → pauses voting; can be resumed with Start Voting again.
- **End Election** → permanently locks voting (requires confirmation) and unlocks the Results Admin dashboard.
- **Reset Election** → requires typing `RESET` to confirm; permanently deletes all ballots and returns the election to `not_started`.

Every ballot is submitted as a single atomic record containing one selection per position, so partial/incomplete ballots are impossible. Vote totals (`election/voteCount`) are updated with an atomic Firebase transaction to avoid race conditions when many PCs submit simultaneously.

---

## 🔒 Security notes

- All permission boundaries are enforced in **`firebase-rules.json`**, not just hidden in the UI — a technically savvy student cannot read results, modify votes, or access admin data even by inspecting network requests.
- Votes (`election/ballots`) can only ever be **created**, never updated or deleted, by rule design — this guarantees votes can't be tampered with after submission.
- Control Admin and Results Admin are strictly separated by the `role` field under `/admins` — Control Admin's security rules block it from ever reading `election/ballots`.
- The Voting PC PIN (`election/security/pcPin`) is validated client-side against the database since this is a static, backend-less site. For stricter security in a high-stakes deployment, consider adding a Firebase Cloud Function to validate the PIN server-side instead.
- Change the default PIN (`2468`) before your election goes live.

---

## 🎨 Design system

- **Typography:** Fraunces (display) + Inter (body) + JetBrains Mono (data/timestamps)
- **Palette:** near-black base (`#0a0d12`), civic gold accent (`#d4af37`), teal for success/active states, red for destructive actions
- **Signature motif:** "The Seal" — a rotating dashed ring with a checkmark, used as the loader, login icon, and the vote-success stamp animation
- All components respect `prefers-reduced-motion` and have visible keyboard focus states for accessibility

---

## 🛠️ Customization

- **School name / election title / logo:** edit `election/meta` in the Realtime Database (`schoolName`, `electionTitle`, `logoUrl`).
- **Positions & candidates:** edit `election/positions` and `election/candidates` directly in the Firebase console Data tab.
- **PC PIN:** edit `election/security/pcPin`.
- **Colors/fonts:** edit the CSS custom properties at the top of `css/base.css`.
