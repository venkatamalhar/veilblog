# VeilBlog

Anonymous members-only blog prototype with Google-account-only entry, per-post anonymity, outline-based writing, and multi-admin controls.

## Run locally

```sh
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

## Google Sign-In

The app includes a Google login button and a domain gate for:

```txt
@hyderabad.bits-pilani.ac.in
```

To enable Google Identity Services directly:

1. Create an OAuth client ID in Google Cloud Console for a web application.
2. Add `http://127.0.0.1:4173` to authorized JavaScript origins.
3. Replace `PASTE_YOUR_GOOGLE_CLIENT_ID_HERE` in `app.js`.

If you are using Firebase Auth instead, wire your Firebase Google provider to the existing `Continue with Google`
button and call this after Firebase returns the signed-in user:

```js
window.handleGoogleLoginSuccess({
  email: firebaseUser.email,
  name: firebaseUser.displayName
});
```

Any account outside `@hyderabad.bits-pilani.ac.in` is rejected before the blog posting area opens.

## Data

This prototype stores users and posts in `localStorage`. For production, connect the same UI to a backend database and verify the Google ID token server-side before creating sessions.
