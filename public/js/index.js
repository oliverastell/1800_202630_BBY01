
const canvasDiv = document.getElementById("mapCanvasDiv")
const canvas = document.getElementById("mapCanvas")
const ctx = canvas.getContext("2d")
const mapPlaceholder = new Image();


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
}

//Temporary Image Placeholder for our map
function redraw() {
        const scale = Math.max(
            canvas.width / mapPlaceholder.naturalWidth,
            canvas.height / mapPlaceholder.naturalHeight
        )
        const w = mapPlaceholder.naturalWidth * scale
        const h = mapPlaceholder.naturalHeight * scale
        ctx.drawImage(mapPlaceholder, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
}

function updateCanvas() {
    console.log(canvas.height)
    updateCanvasSize();
    redraw();
}

//Load map and call to update after it has been loaded
mapPlaceholder.onload = updateCanvas
mapPlaceholder.src = "/img/Map-Placeholder.png"

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

function clickSearch(){
    searchMenu.classList.toggle("d-none");
    searchMenu.classList.toggle("d-flex");
}

function searchFilter(color){
    /*I'm going to ignore this line for now => ctx.clearRect(0, 0, canvas.width, canvas.height);
    call redraw()  first so it draw on top of the existing canvas after
    */
    redraw()

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
    /*I'm going to ignore this line for now => ctx.clearRect(0, 0, canvas.width, canvas.height);
    call redraw()  first so it draw on top of the existing canvas after
    */
    redraw()
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
    const searchText = document.getElementById("searchField").value.trim().toLowerCase();
    console.log("aaa")
    searchRecent(searchText);
    console.log("bb")
}

//prevent reload when button is submitted and call search()
searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    search();
});
////
//// END PLACEHOLDER
////