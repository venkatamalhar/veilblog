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
  allPosts: document.querySelector("#allPosts"),
  peopleList: document.querySelector("#peopleList"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteEmail: document.querySelector("#inviteEmail"),
  inviteRole: document.querySelector("#inviteRole"),
  adminCount: document.querySelector("#adminCount")
};

const formFields = [
  "authorMode",
  "postTitle",
  "postContext",
  "postConclusion"
];

let editingPostId = null;

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

async function fetchPosts() {
  const snapshot = await db.collection("posts").orderBy("submittedAt", "desc").get();
  state.posts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  saveState();
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
  await fetchPosts();
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

function renderPostCard(post) {
  const card = elements.postTemplate.content.firstElementChild.cloneNode(true);
  const postDate = post.submittedAt || "";

  card.querySelector(".post-meta").textContent =
    `${bylineFor(post)}${postDate ? ` · ${formatDateTime(postDate)}` : ""}`;

  card.querySelector("h3").textContent = post.title;

  card.querySelector(".post-intro").innerHTML = `
    <strong>Context</strong><br><br>
    ${escapeHtml(post.context || "")}
    <br><br>
    <strong>Conclusion</strong><br><br>
    ${escapeHtml(post.conclusion || "")}
  `;

  card.querySelector(".post-details").innerHTML = `
    <p><strong>Author choice:</strong>
    ${post.authorMode === "anonymous" ? "Anonymous" : "Named"}</p>

    <p><strong>Submitted by account:</strong>
    ${escapeHtml(post.authorEmail || "Unknown")}</p>
  `;

  if (isAdmin()) {
    const removeActions = document.createElement("div");
    removeActions.className = "post-actions";
    removeActions.innerHTML = `
      <button class="danger-btn" data-action="delete" data-id="${post.id}">
        Remove post
      </button>
    `;
    card.append(removeActions);
  }

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
    .sort((a, b) => (b.submittedAt || b.publishDate || "").localeCompare(a.submittedAt || a.publishDate || ""))
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
      <div class="item-actions">
        <button class="primary-btn" data-action="approve" data-id="${post.id}">Approve</button>
        <button class="danger-btn" data-action="reject" data-id="${post.id}">Reject</button>
        <button class="ghost-btn" data-action="edit" data-id="${post.id}">Edit</button>
        <button class="danger-btn" data-action="delete" data-id="${post.id}">Remove post</button>
      </div>
    `;
    elements.pendingPosts.append(item);
  });
}

function renderAllPosts() {
  elements.allPosts.replaceChildren();

  if (!state.posts.length) {
    elements.allPosts.innerHTML = `<div class="empty-state">No posts have been submitted yet.</div>`;
    return;
  }

  state.posts
    .slice()
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))
    .forEach((post) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div class="item-row">
          <div>
            <strong>${escapeHtml(post.title)}</strong>
            <p class="tiny">${escapeHtml(post.authorName)} · ${escapeHtml(post.authorEmail)}</p>
            <p class="tiny">Submitted: ${escapeHtml(formatDateTime(post.submittedAt))}</p>
          </div>
          <span class="status-pill">${escapeHtml(post.status)}</span>
        </div>
        <div class="item-actions">
          ${post.status !== "published" ? `<button class="primary-btn" data-action="approve" data-id="${post.id}">Approve</button>` : ""}
          ${post.status !== "rejected" ? `<button class="danger-btn" data-action="reject" data-id="${post.id}">Reject</button>` : ""}
          <button class="ghost-btn" data-action="edit" data-id="${post.id}">Edit</button>
          <button class="danger-btn" data-action="delete" data-id="${post.id}">Remove post</button>
        </div>
      `;
      elements.allPosts.append(item);
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
  renderAllPosts();
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
  const existingPost = editingPostId ? state.posts.find((post) => post.id === editingPostId) : null;

  return {
    id: editingPostId || crypto.randomUUID(),
    status: existingPost?.status || status,
    title: document.querySelector("#postTitle").value.trim(),
    context: document.querySelector("#postContext").value.trim(),
    conclusion: document.querySelector("#postConclusion").value.trim(),
    authorMode: document.querySelector("#authorMode").value,
    authorName: existingPost?.authorName || user.name,
    authorEmail: existingPost?.authorEmail || user.email,
    submittedAt: existingPost?.submittedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: user.email
  };
}

function resetForm() {
  elements.postForm.reset();
  editingPostId = null;
  elements.saveStatus.textContent = "Draft not saved";
}

async function savePost(post) {
  await db.collection("posts").doc(post.id).set(post, { merge: true });
  const index = state.posts.findIndex((entry) => entry.id === post.id);

  if (index >= 0) {
    state.posts[index] = post;
  } else {
    state.posts.unshift(post);
  }

  saveState();
}

async function saveDraft() {
  const existingPost = editingPostId ? state.posts.find((post) => post.id === editingPostId) : null;
  const post = collectPost(existingPost?.status || "draft");
  if (!post.title) {
    elements.saveStatus.textContent = "Add a title before saving";
    return;
  }
  await savePost(post);
  elements.saveStatus.textContent = "Draft saved";
  render();
}

async function submitPost(event) {
  event.preventDefault();
  const existingPost = editingPostId ? state.posts.find((post) => post.id === editingPostId) : null;
  const post = collectPost(existingPost?.status || "pending");
  await savePost(post);
  resetForm();
  render();
  switchView("editorPanel");
  elements.saveStatus.textContent = "Submitted for admin review";
}

function editPost(post) {
  editingPostId = post.id;
  document.querySelector("#postTitle").value = post.title || "";
  document.querySelector("#postContext").value = post.context || "";
  document.querySelector("#postConclusion").value = post.conclusion || "";
  document.querySelector("#authorMode").value = post.authorMode || "anonymous";
  elements.saveStatus.textContent = `Editing ${post.status} post`;
  switchView("editorPanel");
}

async function handlePostAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const post = state.posts.find((entry) => entry.id === button.dataset.id);
  if (!post) return;

  if (button.dataset.action === "edit") {
    editPost(post);
    return;
  }

  if (button.dataset.action === "delete") {
    const confirmed = confirm(`Delete "${post.title}"?`);
    if (!confirmed) return;
    await db.collection("posts").doc(post.id).delete();
    state.posts = state.posts.filter((entry) => entry.id !== post.id);
    saveState();
    render();
    return;
  }

  post.status = button.dataset.action === "approve" ? "published" : "rejected";
  post.reviewedAt = new Date().toISOString();
  post.reviewedBy = currentUser()?.email || "";
  await savePost(post);
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
elements.postFeed.addEventListener("click", handlePostAction);
elements.pendingPosts.addEventListener("click", handlePostAction);
elements.allPosts.addEventListener("click", handlePostAction);
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
    state.users = [];
    render();
  } catch (error) {
    showLoginError(error.message || "Could not load Firebase login data.");
    render();
  }
});

render();
