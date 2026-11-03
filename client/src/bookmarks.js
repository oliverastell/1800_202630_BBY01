import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

const button = document.getElementById("bookmark-button")
const popup = document.getElementById("bookmark-popup")
const offIconPath = "/res/img/bookmark-icon.svg"
const onIconPath = "/res/img/bookmark-icon-filled.svg"

// create a list for bookmarked items
const list = document.createElement("ul")
list.classList.add("bookmark-list")
list.style.listStyle = "none"
list.style.padding = "0"
popup.appendChild(list)

//select every bookmark icon that is clickable
const bookmarkButton = document.querySelectorAll(".bookmark-toggle")

// Track bookmarked items for each button
const bookmarkItems = new Map()

// Use the same tracking map for clicks and bookmarks loaded from Firestore.
bookmarkButton.forEach (function(current){
  current.addEventListener("click", function() {
    const icon = current.querySelector("img")
    const text = current.previousElementSibling.textContent
    const searchTarget = text.toLowerCase().trim()

    const bookmark = bookmarkItems.get(current)
    if (!bookmark){
      addBookmarkToList(searchTarget, text)

      // Save to Firestore if user is logged in
      saveBookmarkToFirestore(searchTarget, text)
    }
    else{
      icon.src = offIconPath
      bookmark.item.remove()

      // Remove from tracking and Firestore
      bookmarkItems.delete(current)
      removeBookmarkFromFirestore(searchTarget)
    }
  })
})

//When click bookmark button this unhide the list
button.addEventListener("click", function() {
  popup.hidden = !popup.hidden
})

async function saveBookmarkToFirestore(searchTarget, displayText) {
  const user = auth.currentUser
  if (!user) return

  try {
    const bookmarksRef = doc(db, "users", user.uid, "bookmarks", searchTarget)
    await setDoc(bookmarksRef, {
      searchTarget: searchTarget,
      displayText: displayText,
      createdAt: new Date().toISOString()
    })
  } catch (error) {
    console.error("Error saving bookmark:", error)
  }
}

async function removeBookmarkFromFirestore(searchTarget) {
  const user = auth.currentUser
  if (!user) return

  try {
    const bookmarksRef = doc(db, "users", user.uid, "bookmarks", searchTarget)
    await deleteDoc(bookmarksRef)
  } catch (error) {
    console.error("Error removing bookmark:", error)
  }
}

async function loadUserBookmarks(user) {
  if (!user) {
    // Clear bookmarks when logged out
    clearBookmarkList()
    return
  }

  try {
    const bookmarksRef = collection(db, "users", user.uid, "bookmarks")
    const snapshot = await getDocs(bookmarksRef)

    clearBookmarkList()

    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.searchTarget && data.displayText) {
        addBookmarkToList(data.searchTarget, data.displayText)
      }
    })
  } catch (error) {
    console.error("Error loading bookmarks:", error)
  }
}

function addBookmarkToList(searchTarget, displayText) {
  // Find the corresponding bookmark button
  const targetButton = Array.from(bookmarkButton).find(btn => {
    const text = btn.previousElementSibling.textContent.toLowerCase().trim()
    return text === searchTarget
  })

  if (!targetButton) return
  if (bookmarkItems.has(targetButton)) return

  const icon = targetButton.querySelector("img")
  if (!icon) return

  icon.src = onIconPath

  const item = document.createElement("li")
  const anchor = document.createElement("a")
  anchor.href = "#"
  anchor.style.textDecoration = "none"
  anchor.textContent = displayText
  anchor.onclick = function (e) {
    e.preventDefault()
    searchRecent(searchTarget, false)
  }
  item.appendChild(anchor)
  list.appendChild(item)

  // Track this bookmark
  bookmarkItems.set(targetButton, { item, searchTarget, text: displayText })
}

// Clear the bookmark list and reset icons
function clearBookmarkList() {
  list.innerHTML = ""
  bookmarkItems.forEach((data, button) => {
    const icon = button.querySelector("img")
    if (icon) {
      icon.src = offIconPath
    }
  })
  bookmarkItems.clear()
}

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  loadUserBookmarks(user)
})
