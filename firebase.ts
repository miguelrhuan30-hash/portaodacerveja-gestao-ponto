import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBqmDDIyFFfPEIvnP5Y8FkhaDcL_i5G1bs",
  appId: "1:1023100601926:web:983699e4eb94dcb0ee6c47",
  authDomain: "gen-lang-client-0756600199.firebaseapp.com",
  projectId: "gen-lang-client-0756600199",
  storageBucket: "gen-lang-client-0756600199.firebasestorage.app",
  messagingSenderId: "1023100601926",
  measurementId: "G-72X9795H7H"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
