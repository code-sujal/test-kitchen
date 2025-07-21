// kitchen-display/firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyCRXcYr7KGprSVP4MAmMzW4kc9RDSEBdm0",
    authDomain: "korba-restaurant-qr-system.firebaseapp.com",
    projectId: "korba-restaurant-qr-system",
    storageBucket: "korba-restaurant-qr-system.firebasestorage.app",
    messagingSenderId: "658722028074",
    appId: "1:658722028074:web:62094df5e586e71f05a153",
    measurementId: "G-JSMZFRN83L"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

console.log('🔥 Kitchen Display Firebase initialized');
