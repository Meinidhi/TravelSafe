// Firebase Configuration
// Placeholder values for Firebase keys
const firebaseConfig = {
    apiKey: "AIzaSyBCFnKnG7rEsZkbfyCfbsl5fOnZgRAuYMM",
    authDomain: "travelsafe-f3abb.firebaseapp.com",
    projectId: "travelsafe-f3abb",
    storageBucket: "travelsafe-f3abb.firebasestorage.app",
    messagingSenderId: "94362423690",
    appId: "1:94362423690:web:739a84cc98f9990244f873",
    measurementId: "G-Q9D5045G1Z"
};

// Initialize Firebase using the compat SDK
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Expose to global scope
window.auth = auth;
window.db = db;

console.log("Firebase Connected");
