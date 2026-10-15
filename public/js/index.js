
let canvasDiv = document.getElementById("mapCanvasDiv")
let canvas = document.getElementById("mapCanvas")
let ctx = canvas.getContext("2d")

function updateCanvasSize() {
    canvas.width = Math.ceil(canvasDiv.offsetWidth);
    canvas.height = Math.ceil(canvasDiv.offsetHeight);
}

function redraw() {
    let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, "#FF00FF")
    gradient.addColorStop(1, "#00FF00")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function updateCanvas() {
    updateCanvasSize();
    redraw();
}

let resizeObserver = new ResizeObserver((entries) => {
    updateCanvas()
});
resizeObserver.observe(canvasDiv)

updateCanvas()