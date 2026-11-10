import { auth } from "./firebaseConfig.js";
import { onAuthStateChanged, signOut } from "firebase/auth";

const button = document.getElementById("login-button");
const label = button.querySelector(".login-status");
const logoutIcon = button.querySelector(".logout-icon");
const loginIcon = button.querySelector(".login-icon");
const status = document.getElementById("auth-status");

onAuthStateChanged(auth, function (user) {
  button.classList.toggle("is-signed-in", Boolean(user));
  label.hidden = !user;
  logoutIcon.hidden = !user;
  loginIcon.innerHTML = user
    ? '<path d="m5 12 4 4L19 6" />'
    : '<circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" />';
  const description = user ? "Click to log out" : "Log in";
  button.setAttribute("aria-label", description);
  button.title = description;
  status.textContent = user ? "You are signed in." : "You are signed out.";
  button.disabled = false;
});

button.addEventListener("click", function () {
  if (auth.currentUser) {
    //log out
    button.disabled = true;
    signOut(auth).catch((error) => {
      console.error("Logout failed:", error);
      status.textContent = "Could not log out. Please try again.";
      button.disabled = false;
    });
    //log in
  } else {
    window.location.href = "/login";
  }
});
