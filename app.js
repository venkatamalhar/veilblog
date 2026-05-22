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
