import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  // --- PREENCHA COM OS DADOS QUE VOCÊ COPIOU DO CONSOLE ---
  apiKey: "AIzaSyBqmDDIyFFfPEIvnP5Y8FkhaDcL_i5G1bs",
  appId: "1:1023100601926:web:983699e4eb94dcb0ee6c47",
  
  // --- ESTES DADOS EU JÁ CORRIGI PARA VOCÊ (CONFIRA SE BATEREM) ---
  authDomain: "gen-lang-client-0756600199.firebaseapp.com",
  projectId: "gen-lang-client-0756600199",
  storageBucket: "gen-lang-client-0756600199.firebasestorage.app",
  messagingSenderId: "1023100601926",
  measurementId: "G-72X9795H7H"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta o banco de dados e o storage
export const db = getFirestore(app);
export const storage = getStorage(app);