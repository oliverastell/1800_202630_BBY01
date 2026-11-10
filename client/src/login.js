import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "firebase/auth";
import { auth } from "./firebaseConfig.js";

// Switch between login and signup
const loginView = document.getElementById("loginView");
const signupView = document.getElementById("signupView");

document.getElementById("toSignup").addEventListener("click", function (event) {
  event.preventDefault();
  loginView.classList.add("d-none");
  signupView.classList.remove("d-none");
});

document.getElementById("toLogin").addEventListener("click", function (event) {
  event.preventDefault();
  signupView.classList.add("d-none");
  loginView.classList.remove("d-none");
});

//sign up
const signupForm = document.getElementById("signupForm");

signupForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      document.getElementById("signupMessage").textContent =
        "Account created successfully!";
        window.location.href= "/";
    })
    .catch((error) => {
      document.getElementById("signupMessage").textContent =
        error.message;
    });
});
//login
const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  signInWithEmailAndPassword(auth, email, password)
    .then(() => {
      window.location.href = "/";
    })
    .catch((error) => {
      document.getElementById("loginMessage").textContent =
        error.message;
    });
});




