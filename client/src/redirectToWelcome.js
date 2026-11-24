import {auth} from "./firebaseConfig.js";


// If the person is logged in, or they havent seen the welcome page for 60 minutes, pop it up
export function redirectToWelcomeIfNecessary() {
    // 60 minutes
    if (Date.now() < localStorage.getItem("last-welcomed") + 60 * 60 * 1000) {
        return
    }

    if (auth.currentUser !== null) {
        return;
    }

    console.log("User is not signed in. Go to welcome page.")
    window.location.href = "/welcome"
}