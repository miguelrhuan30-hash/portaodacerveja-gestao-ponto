
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBqmDDIyFFfPEIvnP5Y8FkhaDcL_i5G1bs",
  authDomain: "gen-lang-client-0756600199.firebaseapp.com",
  projectId: "gen-lang-client-0756600199",
  storageBucket: "gen-lang-client-0756600199.firebasestorage.app",
  messagingSenderId: "1023100601926",
  appId: "1:1023100601926:web:983699e4eb94dcb0ee6c47",
  measurementId: "G-72X9795H7H"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços para usar no resto do app
export const db = getFirestore(app);
export const storage = getStorage(app);
