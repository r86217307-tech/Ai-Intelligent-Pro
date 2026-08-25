import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDO6yMQlRuR1oxWVoJKoZxWJ_vu8Lo7Pe8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "vaulted-jigsaw-g6shk.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "vaulted-jigsaw-g6shk",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "vaulted-jigsaw-g6shk.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1097693221498",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1097693221498:web:35e4a4788edc6dfd60a1c3"
};

// Use the exact databaseId generated during setup
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-712d25b4-2e75-4745-9fcd-5f1ef78ea136");
