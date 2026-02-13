// PASTE YOUR FIREBASE CONFIG HERE
// You can get this from the Firebase Console -> Project Settings -> General -> "SDK Setup and Configuration" -> "CDN"

const firebaseConfig = {
    apiKey: "AIzaSyBQDdzlJemo4Cbw3SKcTDX_YjQ27eCp5ug",
    authDomain: "ghost-chatamd.firebaseapp.com",
    projectId: "ghost-chatamd",
    storageBucket: "ghost-chatamd.appspot.com",
    messagingSenderId: "100973455099363666904",
    appId: "1:100973455099363666904:web:abcdef123456" // Dummy ID (Firestore usually works without exact App ID)
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.firestore(); // Make global
} else {
    console.error("Firebase SDK not loaded.");
}
