// https://expressjs.com/en/guide/routing.html

import express from "express";
import ViteExpress from "vite-express";
import * as fs from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
// REQUIRES
const app = express();
app.use(express.json());

// just like a simple web server like Apache web server
// we are mapping file system paths to the app's virtual paths
app.use('/data', express.static(
    fileURLToPath(new URL('../data/', import.meta.url))
));

// css/bootstrap/bootstrap.min.css
app.use('/bootstrap', express.static('./node_modules/bootstrap/dist/css'));

// main page
app.get("/", function (req, res) {
    let doc = fs.readFileSync(new URL("../../client/html/index.html", import.meta.url), "utf8");
    res.send(doc);
});

//login page
app.get("/login", function(req,res){
    let doc = fs.readFileSync(new URL("../../client/html/login.html", import.meta.url), "utf-8");
    res.send(doc);
})

app.get("/welcome", function(req,res){
    let doc = fs.readFileSync(new URL("../../client/html/welcome.html", import.meta.url), "utf-8");
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

const server = createServer(app);
server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the existing server before running npm run dev again.`);
    } else {
        console.error("Server failed to start:", error);
    }
    process.exitCode = 1;
});
server.listen(port, () => ViteExpress.bind(app, server, onServerRun));
