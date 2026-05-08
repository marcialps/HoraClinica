const firebaseConfig = {
  apiKey: "AIzaSyCl7XUYi3h7WAlGNRZ7zGcwg42-fscV_Q0",
  authDomain: "horaclinica.firebaseapp.com",
  projectId: "horaclinica",
  storageBucket: "horaclinica.firebasestorage.app",
  messagingSenderId: "627112527415",
  appId: "1:627112527415:web:f3f1bf9434e12b215521b2",
  measurementId: "G-P1E25Q8ME3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
