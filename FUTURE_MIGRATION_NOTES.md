# Future Migration Notes

For the IRMA CRM app or any similar internal tool, consider moving from a static GitHub Pages style app to a Firebase-centered app foundation.

Recommended path:

1. Move hosting to Firebase Hosting while keeping the current frontend mostly intact.
2. Add Firebase Authentication with Google sign-in and per-user or approved-user access.
3. Add Firebase Cloud Functions for private backend work such as external AI parsing, secure API calls, scheduled jobs, and server-side validation.
4. Prefer Firestore for future app data models, especially if records, users, permissions, or workflows grow beyond a single shared array/document.
5. Refactor the frontend into a Vite app once the UI has enough views and workflows to justify modules/components.

Target architecture:

```text
Firebase Hosting
  - frontend app

Firebase Auth
  - Google sign-in / authorized users

Firestore
  - users, records, workflows, app data

Cloud Functions
  - OpenAI/API calls, private integrations, background jobs
```

Why this matters:

- Keeps API keys and privileged logic out of the browser.
- Gives a clean path for AI features without exposing secrets.
- Makes security rules easier to reason about.
- Scales better than a static single-file app plus ad hoc database writes.
- Creates a reusable app pattern for future internal tools.
