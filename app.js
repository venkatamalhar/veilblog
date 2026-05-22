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
googleProvider.setCustomParameters({
  hd: "hyderabad.bits-pilani.ac.in"
});

const defaultState = {
  currentUserEmail: null,
  users: [],
  posts: []
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
  "authorMode",
  "postTitle",
  "postContext",
  "postConclusion"
];

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return structuredClone(defaultState);
  }

  try {
    return {
      ...structuredClone(defaultState),
      posts: JSON.parse(saved)
    };
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
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state.posts)
  );
}

function currentUser() {
  const user =
    state.users.find(
      (entry) => entry.email === state.currentUserEmail
    ) || null;

  return user && isAllowedEmail(user.email)
    ? user
    : null;
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function isAllowedEmail(email = "") {
  return email
    .toLowerCase()
    .endsWith(ALLOWED_EMAIL_DOMAIN);
}

function showLoginError(message) {
  elements.loginError.textContent = message;

  elements.loginError.classList.toggle(
    "hidden",
    !message
  );
}

function formatDateTime(value) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function fetchUsers() {
  const snapshot = await db
    .collection("users")
    .orderBy("lastLoginAt", "desc")
    .get();

  state.users = snapshot.docs
    .map((doc) => doc.data())
    .filter((user) =>
      isAllowedEmail(user.email)
    );
}

async function hasAnyAdmin() {
  const snapshot = await db
    .collection("users")
    .where("role", "==", "admin")
    .limit(1)
    .get();

  return !snapshot.empty;
}

async function signInFirebaseUser(firebaseUser) {
  const email = firebaseUser.email.toLowerCase();

  if (!isAllowedEmail(email)) {
    await auth.signOut();

    showLoginError(
      `Only ${ALLOWED_EMAIL_DOMAIN} accounts allowed`
    );

    return;
  }

  const userRef = db.collection("users").doc(email);

  const userDoc = await userRef.get();

  const existingUser = userDoc.exists
    ? userDoc.data()
    : null;

  const now = new Date().toISOString();

  const user = {
    email,
    name:
      firebaseUser.displayName ||
      existingUser?.name ||
      email.split("@")[0],

    role:
      existingUser?.role ||
      ((await hasAnyAdmin())
        ? "writer"
        : "admin"),

    status: existingUser?.status || "active",

    firstLoginAt:
      existingUser?.firstLoginAt || now,

    lastLoginAt: now,

    loginCount:
      (existingUser?.loginCount || 0) + 1
  };

  await userRef.set(user, { merge: true });

  await fetchUsers();

  state.currentUserEmail = email;

  render();
}

async function signOut() {
  await auth.signOut();

  state.currentUserEmail = null;

  render();
}

async function startGoogleSignIn() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (error) {
    showLoginError(
      error.message || "Google sign in failed"
    );
  }
}

function switchView(viewId) {
  document
    .querySelectorAll(".view-panel")
    .forEach((panel) => {
      panel.classList.toggle(
        "hidden",
        panel.id !== viewId
      );
    });

  elements.tabs.forEach((tab) => {
    tab.classList.toggle(
      "active",
      tab.dataset.view === viewId
    );
  });
}

function bylineFor(post) {
  return post.authorMode === "anonymous"
    ? "Anonymous author"
    : post.authorName;
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
  const card =
    elements.postTemplate.content.firstElementChild.cloneNode(
      true
    );

  const postDate = post.submittedAt || "";

  card.querySelector(".post-meta").textContent =
    `${bylineFor(post)}${
      postDate
        ? ` · ${formatDateTime(postDate)}`
        : ""
    }`;

  card.querySelector("h3").textContent =
    post.title;

  card.querySelector(".post-intro").innerHTML = `
    <strong>Context</strong>
    <br><br>
    ${escapeHtml(post.context || "")}

    <br><br>

    <strong>Conclusion</strong>
    <br><br>
    ${escapeHtml(post.conclusion || "")}
  `;

  card.querySelector(".post-details").innerHTML = `
    <p>
      <strong>Author choice:</strong>
      ${
        post.authorMode === "anonymous"
          ? "Anonymous"
          : "Named"
      }
    </p>

    <p>
      <strong>Submitted by account:</strong>
      ${escapeHtml(post.authorEmail || "Unknown")}
    </p>

    ${
      isAdmin()
        ? `
        <button
          class="danger-btn delete-post-btn"
          data-delete-id="${post.id}"
        >
          Delete post
        </button>
      `
        : ""
    }
  `;

  return card;
}

function renderFeed() {
  const posts = state.posts.filter(
    (post) => post.status === "published"
  );

  elements.postFeed.replaceChildren();

  if (!posts.length) {
    elements.postFeed.innerHTML =
      `<div class="empty-state">No posts yet</div>`;

    return;
  }

  posts.forEach((post) => {
    elements.postFeed.append(
      renderPostCard(post)
    );
  });
}

function render() {
  const user = currentUser();

  elements.loginView.classList.toggle(
    "hidden",
    Boolean(user)
  );

  elements.dashboardView.classList.toggle(
    "hidden",
    !user
  );

  if (!user) return;

  elements.userName.textContent =
    `${user.name} · ${user.role}`;

  elements.adminOnly.forEach((item) => {
    item.classList.toggle(
      "hidden",
      !isAdmin()
    );
  });

  renderFeed();
}

function collectPost(status) {
  const user = currentUser();

  return {
    id: crypto.randomUUID(),

    status,

    title: document
      .querySelector("#postTitle")
      .value.trim(),

    context: document
      .querySelector("#postContext")
      .value.trim(),

    conclusion: document
      .querySelector("#postConclusion")
      .value.trim(),

    authorMode: document
      .querySelector("#authorMode")
      .value,

    authorName: user.name,

    authorEmail: user.email,

    submittedAt: new Date().toISOString()
  };
}

function resetForm() {
  elements.postForm.reset();

  elements.saveStatus.textContent =
    "Draft not saved";
}

function saveDraft() {
  const post = collectPost("draft");

  state.posts.push(post);

  saveState();

  elements.saveStatus.textContent =
    "Draft saved";
}

function submitPost(event) {
  event.preventDefault();

  const post = collectPost(
    isAdmin() ? "published" : "pending"
  );

  state.posts.push(post);

  saveState();

  resetForm();

  render();

  elements.saveStatus.textContent =
    isAdmin()
      ? "Published"
      : "Submitted for review";
}

elements.signOutBtn.addEventListener(
  "click",
  signOut
);

elements.googleLoginBtn.addEventListener(
  "click",
  startGoogleSignIn
);

elements.postForm.addEventListener(
  "submit",
  submitPost
);

elements.saveDraftBtn.addEventListener(
  "click",
  saveDraft
);

elements.postFeed.addEventListener(
  "click",
  (event) => {
    const deleteBtn = event.target.closest(
      ".delete-post-btn"
    );

    if (!deleteBtn) return;

    if (!isAdmin()) return;

    const postId =
      deleteBtn.dataset.deleteId;

    state.posts = state.posts.filter(
      (post) => post.id !== postId
    );

    saveState();

    render();
  }
);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchView(tab.dataset.view);
  });
});

elements.shortcuts.forEach((shortcut) => {
  shortcut.addEventListener("click", () => {
    switchView(
      shortcut.dataset.viewShortcut
    );
  });
});

formFields.forEach((id) => {
  document
    .querySelector(`#${id}`)
    .addEventListener("input", () => {
      elements.saveStatus.textContent =
        "Editing";
    });
});

auth.onAuthStateChanged(async (firebaseUser) => {
  if (firebaseUser) {
    await signInFirebaseUser(firebaseUser);
    return;
  }

  state.currentUserEmail = null;
  state.users = [];

  render();
});

render();
