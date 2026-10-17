// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCx3AIi3OFDV20PAI35jldeUa2xlvQv-6c",
  authDomain: "demo1800-ba816.firebaseapp.com",
  projectId: "demo1800-ba816",
  storageBucket: "demo1800-ba816.firebasestorage.app",
  messagingSenderId: "756669733605",
  appId: "1:756669733605:web:a439df16971b9ad68ed20c",
  measurementId: "G-0HHBQD07NB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app)
