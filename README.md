# Five Tiles

A phone-first Five Tiles / Five-Up / Muggins domino game. The landing page, rules, and pass-and-play practice table work without an account. Shared rooms use the configured Firebase project with Firebase Authentication (anonymous sign-in) and Cloud Firestore. The Firebase web app config is public client configuration embedded in the client; access is controlled by Firebase Authentication and the Firestore rules.

## Run locally

```sh
npm ci
npm run dev
```

To turn on shared invite rooms, enable **Authentication → Sign-in method → Anonymous**, create a **Cloud Firestore** database, and publish the included `firestore.rules` in the `funnn-c0f93` Firebase project. The project config is already in the app. Optional `VITE_FIREBASE_*` variables in `.env.local` can override it when developing against a different project. No Firebase service account or private key belongs in the browser app.

## Host on GitHub Pages

The included GitHub Actions workflow builds and publishes the static app to GitHub Pages whenever `main` changes. It enables Pages through the workflow. The app will be available at `https://ifaarix.github.io/five-tile-dominos/` after the first successful run. GitHub Actions runs the production build; Vercel and a separate web server are unnecessary.

To turn on multiplayer, enable anonymous authentication and create the default Cloud Firestore database in the configured Firebase project. These Firebase web config values are public client configuration; Firestore rules and anonymous auth are the security boundary. Publish the included rules (Firebase Console → Firestore → Rules, or `npx firebase-tools deploy --only firestore:rules` after selecting the project), and add `ifaarix.github.io` to Firebase Authentication's authorized domains. Then rerun the Pages workflow.

## Game notes

This table uses a double-six set, highest-double opening, 5s scoring on the two open ends, drawing from the boneyard when stuck, and a 100-point target. House rules vary; the in-app guide explains the version used here. The board is a horizontal, touch-scrollable chain so long games stay legible on small screens. Tile feedback uses a short lift on selection, smooth board auto-scroll, and optional soft tone/haptic response.

Room state is client-managed for casual friend games. All players in a room can read the room document (including hands); this design is not appropriate for ranked or money games.
