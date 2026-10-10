# Five Tiles

A phone-first Five Tiles / Five-Up / Muggins domino game. Enter a name to create or join a party; Firebase Authentication signs players in anonymously in the background, and Cloud Firestore stores shared parties. The landing page, rules, and pass-and-play practice game also work without a Firebase connection. Firebase web app config is public client configuration embedded in the client; access is controlled by Firebase Authentication and Firestore rules.

## Run locally

```sh
npm ci
npm run dev
```

To turn on shared invite rooms, enable **Authentication → Sign-in method → Anonymous**, create the default **Cloud Firestore** database if it does not exist, and publish the included `firestore.rules` in the `funnn-c0f93` Firebase project. The Firebase CLI configuration targets this project and enables anonymous sign-in while disabling email/password sign-in; deploy with `npx -y firebase-tools@latest deploy --only auth,firestore:rules`. The project config is already in the app. Optional `VITE_FIREBASE_*` variables in `.env.local` can override it when developing against a different project. No Firebase service account or private key belongs in the browser app.

## Host on GitHub Pages

The included GitHub Actions workflow builds and publishes the static app to GitHub Pages whenever `main` changes. It enables Pages through the workflow. The app will be available at `https://ifaarix.github.io/five-tile-dominos/` after the first successful run. GitHub Actions runs the production build; Vercel and a separate web server are unnecessary.

Players never need an email or password. The app creates an anonymous Firebase user when they create or join an online party, then uses that identity to enforce party membership. The Firebase Console still needs Anonymous enabled, the default Cloud Firestore database created if needed, and the included rules published before multiplayer works. These Firebase web config values are public client configuration; Firestore rules and Firebase Authentication are the security boundary. Add `ifaarix.github.io` to Firebase Authentication's authorized domains.

## Game notes

This game uses a double-six set, highest-double opening in game one, a four-arm spinner, and scoring from its four exposed branch tips in fives (ends adding to 5 score 1 point, 10 scores 2, 15 scores 3, and so on) with a 20-point target. A player with no match draws one tile and the turn then passes. House rules vary; the in-app guide explains the version used here. Every domino is drawn from a single size unit (`--u`, always 2:1) in `src/tiles.css`, so tiles keep the same shape on every screen. The board scales to fit and pans when a long game outgrows it. Moves show instantly and are confirmed with Firestore in the background.

Room state is client-managed for casual friend games. All players in a room can read the room document (including hands); this design is not appropriate for ranked or money games.
