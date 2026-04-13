/* ============================================
   ExpenseFlow — Firebase Configuration (Template)
   ============================================
   
   ⚠️ IMPORTANT: Copy this file to 'firebase-config.js' 
   and add your actual Firebase credentials.
   
   'firebase-config.js' is currently in .gitignore 
   to protect your API keys on GitHub.
   ============================================ */

const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ── Initialize Firebase (using compat SDK loaded via CDN) ──
let firebaseApp = null;
let auth = null;
let db = null;
let FIREBASE_ENABLED = false;

try {
    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // Enable offline persistence for Firestore
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn('Firestore persistence failed: Multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Firestore persistence not available in this browser');
            }
        });

        FIREBASE_ENABLED = true;
        console.log('🔥 Firebase initialized successfully');
    } else {
        console.warn('⚠️ Firebase not configured. Running in LOCAL MODE (localStorage).');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
    console.warn('⚠️ Falling back to LOCAL MODE (localStorage).');
}
