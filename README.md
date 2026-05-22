# VeilBlog

Anonymous members-only blog prototype with Google-account-only entry, per-post anonymity, outline-based writing, and multi-admin controls.

## Run locally

```sh
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

## Firebase Login

The app uses Firebase Auth with Google sign-in and a domain gate for:

```txt
@hyderabad.bits-pilani.ac.in
```

The Firebase config is already in `app.js`. In Firebase Console, enable:

1. Authentication -> Sign-in method -> Google
2. Authentication -> Settings -> Authorized domains -> `venkatamalhar.github.io`
3. Firestore Database

Every allowed login is saved in Firestore under `users/{email}` with:

- email
- name
- role
- status
- first login
- last login
- login count

Any account outside `@hyderabad.bits-pilani.ac.in` is rejected before the blog posting area opens.

## Data

Users and admin roles are stored in Firestore. Posts are still stored locally in the browser in this prototype.
