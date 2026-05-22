const firebaseConfig = {
  apiKey: "AIzaSyCTVcBM78hWzdJRgni-nT9gxDti2z9IyL8",
  authDomain: "veilblog.firebaseapp.com",
  projectId: "veilblog",
  storageBucket: "veilblog.firebasestorage.app",
  messagingSenderId: "831837729167",
  appId: "1:831837729167:web:3a8efc090276525db39bfa",
  measurementId: "G-4XEDKBN68C"
};

const ALLOWED_EMAIL_DOMAIN = "@hyderabad.bits-pilani.ac.in";
const STORAGE_KEY = "veilblog-posts-v1";

const firebaseApp = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: "hyderabad.bits-pilani.ac.in" });

try {
  firebase.analytics();
} catch {
  // Analytics can be unavailable in some browser/privacy contexts.
}

const defaultState = {
  currentUserEmail: null,
  users: [],
  posts: [
    {
      id: crypto.randomUUID(),
      status: "published",
      title: "How anonymous teams can still publish responsibly",
      sourceLink: "https://example.com/source",
      buyerPersona: "Internal readers and student communities",
      authorMode: "anonymous",
      authorName: "BITS Writer",
      authorEmail: `writer${ALLOWED_EMAIL_DOMAIN}`,
      dueDate: "2026-05-30",
      publishDate: "2026-06-01",
      introduction:
        "Anonymous publishing works best when writers can separate personal identity from the value of the idea. The important part is keeping source links, review history, and admin accountability visible behind the scenes.",
      facts:
        "Readers need a clear original source, a concise title, and a review path. Admins need the ability to approve, reject, and manage roles without exposing private author identity on the public feed.",
      whatHappened:
        "The platform keeps every post tied to a Google account internally, then renders either the writer's name or an anonymous byline depending on the author's selection for that post.",
      viewpoint:
        "Anonymity should protect honest writing, not remove editorial responsibility. That is why this demo keeps moderation controls close to publishing."
    }
  ]
};

let state = normalizeState(loadState());

const elements = {
  loginView: document.querySelector("#loginView"),
  dashboardView: document.querySelector("#dashboardView"),
  googleLoginBtn: document.querySelector("#googleLoginBtn"),
  loginError: document.querySelector("#loginError"),
  userName: document.querySelector("#userName"),
  signOutBtn: document.querySelector("#signOutBtn"),
  tabs: document.querySelectorAll(".tab"),
  shortcuts: document.querySelectorAll("[data-view-shortcut]"),
  adminOnly: document.querySelectorAll(".admin-only"),
  postFeed: document.querySelector("#postFeed"),
  postTemplate: document.querySelector("#postTemplate"),
  postForm: document.querySelector("#postForm"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  saveStatus: document.querySelector("#saveStatus"),
  pendingPosts: document.querySelector("#pendingPosts"),
  peopleList: document.querySelector("#peopleList"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteEmail: document.querySelector("#inviteEmail"),
  inviteRole: document.querySelector("#inviteRole"),
  adminCount: document.querySelector("#adminCount")
};

const formFields = [
  "sourceLink",
  "buyerPersona",
  "authorMode",
  "publishDate",
  "dueDate",
  "postTitle",
  "introduction",
  "facts",
  "whatHappened",
  "viewpoint"
];

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);

  try {
    return { ...structuredClone(defaultState), posts: JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(nextState) {
  nextState.users = [];
  nextState.currentUserEmail = null;
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts));
}

function currentUser() {
  const user = state.users.find((entry) => entry.email === state.currentUserEmail) || null;
  return user && isAllowedEmail(user.email) ? user : null;
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function isAllowedEmail(email = "") {
  return email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);
}

function showLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginError.classList.toggle("hidden", !message);
}

function formatDateTime(value) {
  if (!value) return "Not logged in yet";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function fetchUsers() {
  const snapshot = await db.collection("users").orderBy("lastLoginAt", "desc").get();
  state.users = snapshot.docs.map((doc) => doc.data()).filter((user) => isAllowedEmail(user.email));
}

async function hasAnyAdmin() {
  const snapshot = await db.collection("users").where("role", "==", "admin").limit(1).get();
  return !snapshot.empty;
}

async function signInFirebaseUser(firebaseUser) {
  const email = firebaseUser.email.toLowerCase();
  const now = new Date().toISOString();
  showLoginError("");

  if (!isAllowedEmail(email)) {
    state.currentUserEmail = null;
    await auth.signOut();
    render();
    showLoginError(`Access is restricted to Google accounts ending in ${ALLOWED_EMAIL_DOMAIN}.`);
    return;
  }

  const userRef = db.collection("users").doc(email);
  const userDoc = await userRef.get();
  const existingUser = userDoc.exists ? userDoc.data() : null;

  if (existingUser?.status === "blocked") {
    await auth.signOut();
    showLoginError("This Google account has been blocked by an admin.");
    return;
  }

  const user = {
    email,
    name: firebaseUser.displayName || existingUser?.name || email.split("@")[0],
    role: existingUser?.role || ((await hasAnyAdmin()) ? "writer" : "admin"),
    status: existingUser?.status || "active",
    firstLoginAt: existingUser?.firstLoginAt || now,
    lastLoginAt: now,
    loginCount: (existingUser?.loginCount || 0) + 1
  };

  await userRef.set(user, { merge: true });
  await fetchUsers();
  state.currentUserEmail = email;
  saveState();
  render();
}

async function signOut() {
  await auth.signOut();
  state.currentUserEmail = null;
  showLoginError("");
  render();
}

async function startGoogleSignIn() {
  try {
    showLoginError("");
    await auth.signInWithPopup(googleProvider);
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user") return;
    showLoginError(error.message || "Google sign-in failed.");
  }
}

function switchView(viewId) {
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== viewId);
  });

  elements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewId);
  });
}

function bylineFor(post) {
  return post.authorMode === "anonymous" ? "Anonymous author" : post.authorName;
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeLink(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderPostCard(post) {
  const card = elements.postTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".post-meta").textContent =
    `${bylineFor(post)} · Publishes ${post.publishDate} · ${post.buyerPersona}`;
  card.querySelector("h3").textContent = post.title;
  card.querySelector(".post-intro").textContent = post.introduction;
  const sourceUrl = safeLink(post.sourceLink);
  card.querySelector(".outline-render").innerHTML = `
    <p><strong>Original story:</strong> ${sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a>` : "Not provided"}</p>
    <p><strong>Due date:</strong> ${escapeHtml(post.dueDate)}</p>
    <p><strong>Short facts:</strong> ${escapeHtml(post.facts)}</p>
    <p><strong>What happened:</strong> ${escapeHtml(post.whatHappened)}</p>
    <p><strong>Viewpoint:</strong> ${escapeHtml(post.viewpoint || "No viewpoint added.")}</p>
  `;
  return card;
}

function renderFeed() {
  const posts = state.posts.filter((post) => post.status === "published");
  elements.postFeed.replaceChildren();

  if (!posts.length) {
    elements.postFeed.innerHTML = `<div class="empty-state">No published posts yet.</div>`;
    return;
  }

  posts
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate))
    .forEach((post) => elements.postFeed.append(renderPostCard(post)));
}

function renderPendingPosts() {
  const pending = state.posts.filter((post) => post.status === "pending");
  elements.pendingPosts.replaceChildren();

  if (!pending.length) {
    elements.pendingPosts.innerHTML = `<div class="empty-state">No posts waiting for review.</div>`;
    return;
  }

  pending.forEach((post) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="item-row">
        <div>
          <strong>${escapeHtml(post.title)}</strong>
          <p class="tiny">${escapeHtml(post.authorName)} · ${escapeHtml(post.authorEmail)} · wants ${post.authorMode === "anonymous" ? "anonymous" : "named"} posting</p>
        </div>
        <span class="status-pill">Pending</span>
      </div>
      <p class="tiny">${escapeHtml(post.introduction)}</p>
      <div class="item-actions">
        <button class="primary-btn" data-action="approve" data-id="${post.id}">Approve</button>
        <button class="danger-btn" data-action="reject" data-id="${post.id}">Reject</button>
      </div>
    `;
    elements.pendingPosts.append(item);
  });
}

function renderPeople() {
  const adminTotal = state.users.filter((user) => user.role === "admin" && user.status === "active").length;
  elements.adminCount.textContent = `${adminTotal} active admin${adminTotal === 1 ? "" : "s"}`;
  elements.peopleList.replaceChildren();

  state.users
    .slice()
    .sort((a, b) => {
      const left = a.lastLoginAt || a.firstLoginAt || "";
      const right = b.lastLoginAt || b.firstLoginAt || "";
      return right.localeCompare(left);
    })
    .forEach((user) => {
    const item = document.createElement("div");
    const current = user.email === state.currentUserEmail;
    item.className = "list-item";
    item.innerHTML = `
      <div class="item-row">
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <p class="tiny">${escapeHtml(user.email)}</p>
          <p class="tiny">First login: ${escapeHtml(formatDateTime(user.firstLoginAt))}</p>
          <p class="tiny">Last login: ${escapeHtml(formatDateTime(user.lastLoginAt))} · ${user.loginCount || 0} login${user.loginCount === 1 ? "" : "s"}</p>
        </div>
        <span class="status-pill">${user.role} · ${user.status}${current ? " · you" : ""}</span>
      </div>
      <div class="item-actions">
        <button class="ghost-btn" data-user-action="toggle-role" data-email="${user.email}" ${current ? "disabled" : ""}>
          Make ${user.role === "admin" ? "writer" : "admin"}
        </button>
        <button class="danger-btn" data-user-action="toggle-status" data-email="${user.email}" ${current ? "disabled" : ""}>
          ${user.status === "active" ? "Block" : "Restore"}
        </button>
      </div>
    `;
    elements.peopleList.append(item);
  });
}

function renderAdmin() {
  if (!isAdmin()) return;
  renderPendingPosts();
  renderPeople();
}

function render() {
  const user = currentUser();
  if (state.currentUserEmail && !user) {
    state.currentUserEmail = null;
    saveState();
  }

  elements.loginView.classList.toggle("hidden", Boolean(user));
  elements.dashboardView.classList.toggle("hidden", !user);

  if (!user) return;

  elements.userName.textContent = `${user.name} · ${user.role}`;
  elements.adminOnly.forEach((item) => item.classList.toggle("hidden", !isAdmin()));
  if (!isAdmin() && !document.querySelector("#adminPanel").classList.contains("hidden")) {
    switchView("feedPanel");
  }

  renderFeed();
  renderAdmin();
}

function collectPost(status) {
  const user = currentUser();
  return {
    id: crypto.randomUUID(),
    status,
    title: document.querySelector("#postTitle").value.trim(),
    sourceLink: document.querySelector("#sourceLink").value.trim(),
    buyerPersona: document.querySelector("#buyerPersona").value.trim(),
    authorMode: document.querySelector("#authorMode").value,
    authorName: user.name,
    authorEmail: user.email,
    dueDate: document.querySelector("#dueDate").value,
    publishDate: document.querySelector("#publishDate").value,
    introduction: document.querySelector("#introduction").value.trim(),
    facts: document.querySelector("#facts").value.trim(),
    whatHappened: document.querySelector("#whatHappened").value.trim(),
    viewpoint: document.querySelector("#viewpoint").value.trim()
  };
}

function resetForm() {
  elements.postForm.reset();
  elements.saveStatus.textContent = "Draft not saved";
}

function saveDraft() {
  const post = collectPost("draft");
  if (!post.title) {
    elements.saveStatus.textContent = "Add a title before saving";
    return;
  }
  state.posts.push(post);
  saveState();
  elements.saveStatus.textContent = "Draft saved";
  render();
}

function submitPost(event) {
  event.preventDefault();
  const post = collectPost(isAdmin() ? "published" : "pending");
  state.posts.push(post);
  saveState();
  resetForm();
  render();
  switchView(isAdmin() ? "feedPanel" : "editorPanel");
  elements.saveStatus.textContent = isAdmin() ? "Published" : "Submitted for admin review";
}

function handlePendingAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const post = state.posts.find((entry) => entry.id === button.dataset.id);
  if (!post) return;

  post.status = button.dataset.action === "approve" ? "published" : "rejected";
  saveState();
  render();
}

async function handlePeopleAction(event) {
  const button = event.target.closest("[data-user-action]");
  if (!button) return;

  const user = state.users.find((entry) => entry.email === button.dataset.email);
  if (!user || user.email === state.currentUserEmail) return;

  if (button.dataset.userAction === "toggle-role") {
    user.role = user.role === "admin" ? "writer" : "admin";
  } else {
    user.status = user.status === "active" ? "blocked" : "active";
  }

  await db.collection("users").doc(user.email).set(
    {
      role: user.role,
      status: user.status
    },
    { merge: true }
  );
  await fetchUsers();
  saveState();
  render();
}

async function addPerson(event) {
  event.preventDefault();
  const email = elements.inviteEmail.value.trim().toLowerCase();
  if (!email) return;

  if (!isAllowedEmail(email)) {
    elements.inviteEmail.setCustomValidity(`Use a ${ALLOWED_EMAIL_DOMAIN} account.`);
    elements.inviteEmail.reportValidity();
    return;
  }

  elements.inviteEmail.setCustomValidity("");

  const existing = state.users.find((user) => user.email === email);
  if (existing) {
    existing.role = elements.inviteRole.value;
    existing.status = "active";
  } else {
    state.users.push({
      email,
      name: email.split("@")[0],
      role: elements.inviteRole.value,
      status: "active",
      firstLoginAt: null,
      lastLoginAt: null,
      loginCount: 0
    });
  }

  const user = state.users.find((entry) => entry.email === email);
  await db.collection("users").doc(email).set(user, { merge: true });
  await fetchUsers();
  elements.inviteForm.reset();
  saveState();
  render();
}

elements.signOutBtn.addEventListener("click", signOut);
elements.googleLoginBtn.addEventListener("click", startGoogleSignIn);
elements.postForm.addEventListener("submit", submitPost);
elements.saveDraftBtn.addEventListener("click", saveDraft);
elements.pendingPosts.addEventListener("click", handlePendingAction);
elements.peopleList.addEventListener("click", handlePeopleAction);
elements.inviteForm.addEventListener("submit", addPerson);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

elements.shortcuts.forEach((shortcut) => {
  shortcut.addEventListener("click", () => switchView(shortcut.dataset.viewShortcut));
});

formFields.forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("input", () => {
    elements.saveStatus.textContent = "Editing";
  });
});

auth.onAuthStateChanged(async (firebaseUser) => {
  try {
    if (firebaseUser) {
      await signInFirebaseUser(firebaseUser);
      return;
    }

    state.currentUserEmail = null;
    await fetchUsers();
    render();
  } catch (error) {
    showLoginError(error.message || "Could not load Firebase login data.");
    render();
  }
});

render();
