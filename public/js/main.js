

// import "/css/bootstrap/bootstrap.min.css"

// If you have custom global styles, import them as well:
// import '../styles/style.css';

function sayHello() {

}
// document.addEventListener('DOMContentLoaded', sayHello);

console.log("loaded main.js")

var searchBar = document.getElementById("searchBar");
var searchBarButton = document.getElementById("searchBarButton");
var searchMenu = document.getElementById("searchMenu");
var searchMenuResults = document.getElementById("searchMenuResults");
var searchMenuIcons = document.getElementById("searchMenuIcons");
var searchForm = document.getElementById("searchForm");

var canvasMap = document.getElementById("mapCanvas");
var canvastx = canvasMap.getContext("2d");
var canvasHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

const redsquare1 = JSON.parse('{"name": "red square 1","color": "red", "x": 50, "y": 100}');
const greencircle1 = JSON.parse('{"name": "green circle 1","color": "green", "x": 150, "y": 150}');
const bluetriangle3 = JSON.parse('{"name": "blue triangle 3","color": "blue", "x": 200, "y": 100}');
const yellowrectangle2 = JSON.parse('{"name": "yellow rectangle 2","color": "yellow", "x": 300, "y": 200}');
const redcircle1 = JSON.parse('{"name": "red circle 1","color": "red", "x": 200, "y": 200}');
const greensquare1 = JSON.parse('{"name": "green square 1","color": "green", "x": 150, "y": 50}');
const bluesquare3 = JSON.parse('{"name": "blue square 3","color": "blue", "x": 250, "y": 100}');
const yellowcircle1 = JSON.parse('{"name": "yellow circle 1","color": "yellow", "x": 100, "y": 200}');

shapes = [redsquare1, greencircle1, bluetriangle3, yellowrectangle2, redcircle1, greensquare1, bluesquare3, yellowcircle1];
//console.log(shapes);
//console.log(shapes[0].name)

//console.log(searchMenuIcons.offsetHeight);
searchBar.style.position = "relative";
searchBar.style.top = (canvasMap.offsetHeight) + "px";
searchBarButton.style.width = (canvasMap.offsetWidth) + "px";
searchMenu.style.width = (canvasMap.offsetWidth) + "px";

function clickSearch(){
    var searchMenu = document.getElementById("searchMenu");
    if (searchMenu.style.display === "none" || searchMenu.style.display === "") {
        searchMenu.style.display = "block";
    } else {
        searchMenu.style.display = "none";
    }
    //console.log(searchMenuIcons.offsetHeight);
    searchMenuResults.style.height = (canvasMap.offsetHeight-searchMenuIcons.offsetHeight-searchForm.offsetHeight-searchBar.offsetHeight) + "px";

    //searchBar.onclick = searchMenuPopup();
}

function searchFilter(color){
    canvastx.clearRect(0, 0, canvasMap.width, canvasMap.height);
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].color === color) {
            console.log(shapes[i].name);
            console.log(shapes[i].x);
            console.log(shapes[i].y);
            canvastx.fillStyle = shapes[i].color;
            canvastx.fillRect(shapes[i].x, shapes[i].y, 25, 25);
            canvastx.stroke();
        }
    }
    clickSearch()
}

function searchRecent(target){
    canvastx.clearRect(0, 0, canvasMap.width, canvasMap.height);
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].name == target) {
            canvastx.fillStyle = shapes[i].color;
            canvastx.fillRect(shapes[i].x, shapes[i].y, 25, 25);
            canvastx.stroke();
        }
    }
    clickSearch()
}

function search(){
    var searchText = document.getElementById("searchField").value;
    searchRecent(searchText);
}