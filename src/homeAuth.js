import { auth } from "./firebaseConfig.js";
import { onAuthStateChanged, signOut } from "firebase/auth";

const button = document.getElementById("login-button");
const label = button.querySelector("span");

onAuthStateChanged(auth, function (user) {
  label.textContent = user ? "Log out" : "Login";
});

button.addEventListener("click", function () {
  if (auth.currentUser) {
    //log out
    signOut(auth).catch((error) => {
      console.error("Logout failed:", error);
    });
    //log in
  } else {
    window.location.href = "/login";
  }
});