import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyA5Q6uBGoP66e4G2iXbVOvI3LBiqs8vt2U",
  authDomain: "notificationwork-53964.firebaseapp.com",
  projectId: "notificationwork-53964",
  storageBucket: "notificationwork-53964.firebasestorage.app",
  messagingSenderId: "159225723483",
  appId: "1:159225723483:web:1a9bf2a08d504198695d7e",
  measurementId: "G-CBKJLVEEGS"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const messaging = getMessaging(app);

export { messaging, getToken, onMessage };
