
const canvasDiv = document.getElementById("mapCanvasDiv")
const canvas = document.getElementById("mapCanvas")
const ctx = canvas.getContext("2d")


// ###############MOVED THE SEARCH PLACEHOLDERS UP HERE ###############
const searchBar = document.getElementById("searchBar");
const searchBarButton = document.getElementById("searchBarButton");
const searchMenu = document.getElementById("searchMenu");
const searchMenuResults = document.getElementById("searchMenuResults");
const searchMenuIcons = document.getElementById("searchMenuIcons");
const searchForm = document.getElementById("searchForm");

function updateCanvasSize() {
    canvas.width = Math.ceil(canvasDiv.offsetWidth);
    canvas.height = Math.ceil(canvasDiv.offsetHeight);
    //####### ADDED THE SEARCH BAR REDRAWING TO THE CANVAS UPDATING ########
    searchBar.style.position = "relative";
    searchBar.style.top = (canvas.offsetHeight - searchBar.offsetHeight) + "px";
    searchBarButton.style.width = (canvas.offsetWidth) + "px";
    searchMenu.style.width = (canvas.offsetWidth) + "px";
}

function redraw() {
    let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, "#FF00FF")
    gradient.addColorStop(1, "#00FF00")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function updateCanvas() {
    console.log(canvas.height)
    updateCanvasSize();
    redraw();
}

let resizeObserver = new ResizeObserver((entries) => {
    updateCanvas()
});
resizeObserver.observe(canvasDiv)

updateCanvas()


////
//// PLACEHOLDER: This stuff is placeholder, don't feel bad removing it if you have to
////



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


function clickSearch(){
    //var searchMenu = document.getElementById("searchMenu");
    if (searchMenu.style.display === "none" || searchMenu.style.display === "") {
        searchMenu.style.display = "block";
    } else {
        searchMenu.style.display = "none";
    }
    //console.log(searchMenuIcons.offsetHeight);
    searchMenuResults.style.height = (canvas.offsetHeight-searchMenuIcons.offsetHeight-searchForm.offsetHeight-searchBar.offsetHeight) + "px";

    //searchBar.onclick = searchMenuPopup();
}

function searchFilter(color){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].color === color) {
            console.log(shapes[i].name);
            console.log(shapes[i].x);
            console.log(shapes[i].y);
            ctx.fillStyle = shapes[i].color;
            ctx.fillRect(shapes[i].x, shapes[i].y, 25, 25);
            ctx.stroke();
        }
    }
    clickSearch()
}

function searchRecent(target){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].name === target) {
            ctx.fillStyle = shapes[i].color;
            ctx.fillRect(shapes[i].x, shapes[i].y, 25, 25);
            ctx.stroke();
        }
    }
    clickSearch()
}

function search(){
    console.log("aaa")
    const searchText = document.getElementById("searchField").value;
    searchRecent(searchText);
    console.log("bb")
}

////
//// END PLACEHOLDER
////