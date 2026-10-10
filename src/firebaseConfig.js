// Firebase web app settings are public client configuration, not server credentials.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB1r_jEyqXh5sZmmxh_znrIhRpc8-ZgblQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'funnn-c0f93.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'funnn-c0f93',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1041639511434:web:1b94e315c85fd4e4372473',
};
export const cloudReady = Object.values(firebaseConfig).every(Boolean);
