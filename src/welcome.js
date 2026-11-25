const loginButton = document.getElementById("login-or-signup");
const skipSignup = document.getElementById("skip-signup");


loginButton.addEventListener("click", () => {
    localStorage.setItem("last-welcomed", Date.now().toString())
    window.location.href = "/login"
})


skipSignup.addEventListener("click", () => {
    localStorage.setItem("last-welcomed", Date.now().toString())
    window.location.href = "/"
})