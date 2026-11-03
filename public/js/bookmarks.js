const button = document.getElementById("bookmark-button")
const popup = document.getElementById("bookmark-popup")
const offIconPath = "/img/bookmark-icon.svg"
const onIconPath = "/img/bookmark-icon-filled.svg"

// create a list for bookmarked items
const list = document.createElement("ul")
list.classList.add("bookmark-list")
list.style.listStyle = "none"
list.style.padding = "0"
popup.appendChild(list)

//select every bookmark icon that is clickable
const bookmarkButton = document.querySelectorAll(".bookmark-toggle")

const bookmarkButtonArray = Array.from(bookmarkButton)

function bookmarkT(currentButton){
  bookmarkButtonArray.push(currentButton)

  currentButton.addEventListener("click", function() {
    const icon = currentButton.querySelector("img")
    const text = currentButton .previousElementSibling.textContent
    
    if (icon.getAttribute("src") === offIconPath){
      icon.src = onIconPath
      item = document.createElement("li")
      console.log(text)
      console.log(item)

      const anchor = document.createElement("a")
      anchor.href = "#"
      anchor.style.textDecoration = "none"
      anchor.textContent = text
      anchor.onclick = function (e){
        e.preventDefault()
        searchRecent(text.toLowerCase().trim(), true)
        clickSearch()
        popup.hidden = !popup.hidden
      }

      item.appendChild(anchor)
      list.appendChild(item)
    }
    else{
      console.log(text)
      console.log(item)
      icon.src = offIconPath
      item.remove()
    }
  },{ once: true });
}

/* Go through each bookmark button. Each one has its own item that starts as null.
When click it, if the icon is empty I fill it and add a li with a link to the bookmark list. 
When click a tag will trigger searchRecent function. If it's already filled, I empty it and remove that li. */
bookmarkButtonArray.forEach (function(current){
  let item = null
  current.addEventListener("click", function() {
    const icon = current.querySelector("img")
    const text = current.previousElementSibling.textContent
    
    if (icon.getAttribute("src") === offIconPath){
      icon.src = onIconPath
      item = document.createElement("li")

      const anchor = document.createElement("a")
      anchor.href = "#"
      anchor.style.textDecoration = "none"
      anchor.textContent = text
      anchor.onclick = function (e){
        e.preventDefault()
        searchRecent(text.toLowerCase().trim(), true)
        clickSearch()
        popup.hidden = !popup.hidden
      }

      item.appendChild(anchor)
      list.appendChild(item)
            console.log(item + " added")
    }
    else{
      icon.src = offIconPath
      item.remove()
      console.log(item + " removed")
    }
  })
})

//When click bookmark button this unhide the list
button.addEventListener("click", function() {
  popup.hidden = !popup.hidden
});
