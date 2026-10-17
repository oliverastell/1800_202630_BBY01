// https://expressjs.com/en/guide/routing.html

import express from "express";
import ViteExpress from "vite-express";
import * as fs from "node:fs";

// REQUIRES
const app = express();
app.use(express.json());

// just like a simple web server like Apache web server
// we are mapping file system paths to the app's virtual paths
app.use("/js", express.static("./public/js"));
app.use("/css", express.static("./public/css"));
app.use("/img", express.static("./public/img"));
app.use("/fonts", express.static("./public/fonts"));


// css/bootstrap/bootstrap.min.css
app.use('/css/bootstrap', express.static('./node_modules/bootstrap/dist/css'));

app.get("/", function (req, res) {
    let doc = fs.readFileSync("./app/html/index.html", "utf8");
    res.send(doc);
});

//login page
app.get("/login", function(req,res){
    let doc = fs.readFileSync("./app/html/login.html", "utf-8");
    res.send(doc);
})

app.use(ViteExpress.static());

// for resource not found (i.e., 404)
app.use(function (req, res, next) {
    // this could be a separate file too - but you'd have to make sure that you have the path
    // correct, otherewise, you'd get a 404 on the 404 (actually a 500 on the 404)
    res.status(404).send("<html><head><title>Page not found!</title></head><body><p>Nothing here.</p></body></html>");
});



// RUN SERVER
let port = 8000;

function onServerRun() {
    console.log("Server is listening on port " + port + "...");
}

ViteExpress.listen(app, port, onServerRun);
