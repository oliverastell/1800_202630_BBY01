const button = document.getElementById("bookmark-button");
const popup = document.getElementById("bookmark-popup");

const list = document.createElement("ul");
list.style.listStyle = "none";
list.style.padding = "0";
popup.appendChild(list);

////
//// AI WRITTEN - TODO: Rewrite
////
let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

function save() {
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
}

function render() {
  list.innerHTML = "";
  if (bookmarks.length === 0) {
    list.innerHTML = "<li>No bookmarks yet</li>";
    return;
  }
  bookmarks.forEach((b) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = b.name;
    const del = document.createElement("button");
    del.textContent = "x";
    del.onclick = () => removeBookmark(b.id);
    li.append(name, del);
    list.appendChild(li);
  });
}

function addBookmark(name, x, y) {
  bookmarks.push({ id: Date.now(), name, x, y });
  save();
  render();
}

function removeBookmark(id) {
  bookmarks = bookmarks.filter((b) => b.id !== id);
  save();
  render();
}
////
//// END AI WRITTEN
////

button.addEventListener("click", () => {
  popup.hidden = !popup.hidden;
});
