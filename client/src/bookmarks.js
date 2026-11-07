import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, updateDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

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
const bookmarkButtonArray = Array.from(bookmarkButton)

// Track bookmarked items for each button
const bookmarkItems = new Map()

function bookmarkT(currentButton) {
  bookmarkButtonArray.push(currentButton)

  currentButton.addEventListener("click", function () {
    const icon = currentButton.querySelector("img")
    const text = currentButton.previousElementSibling.textContent
    const searchTarget = text.toLowerCase().trim()

    if (icon.getAttribute("src") === offIconPath) {
      icon.src = onIconPath
      let item = document.createElement("li")
      console.log(text)
      console.log(item)
      const anchor = document.createElement("a")
      anchor.href = "#"
      anchor.style.textDecoration = "none"
      anchor.textContent = text
      anchor.onclick = function (e) {
        e.preventDefault()
        searchRecent(searchTarget, true)
      }

      item.appendChild(anchor)
      list.appendChild(item)

      // Track this bookmark
      bookmarkItems.set(currentButton, { item, searchTarget, text })

      // Save to Firestore if user is logged in
      saveBookmarkToFirestore(searchTarget, text)
    }
    else {
      icon.src = offIconPath
      item.remove()
      item = null

      // Remove from tracking and Firestore
      bookmarkItems.delete(current)
      removeBookmarkFromFirestore(searchTarget)
    }
  }, { once: true });
}


// Use the same tracking map for clicks and bookmarks loaded from Firestore.
bookmarkButton.forEach(function (current) {
  current.addEventListener("click", async function () {
    const icon = current.querySelector("img")
    const text = current.previousElementSibling.textContent
    const searchTarget = text.toLowerCase().trim()

    let bookmark = bookmarkItems.get(current);
    if (bookmark && bookmark.searchTarget !== searchTarget) {
      bookmarkItems.delete(current);
      bookmark = null;
    }
    if (!bookmark) {
      const coordinates = {
        latitude: Number(current.dataset.latitude),
        longitude: Number(current.dataset.longitude)
      };
      if (current.id === "bookmarkSelectedLocation") current.disabled = true;
      const saved = await saveBookmarkToFirestore(searchTarget, text, coordinates);
      if (saved) {
        addBookmarkToList(searchTarget, text, coordinates);
        window.dispatchEvent(new CustomEvent("location-bookmark-saved", {
          detail: { searchTarget, name: text, ...coordinates }
        }));
      } else if (current.id === "bookmarkSelectedLocation") {
        current.disabled = false;
      }
    }
    else {
      icon.src = offIconPath
      bookmark.item.remove()

      // Remove from tracking and Firestore
      bookmarkItems.delete(current)
      removeBookmarkFromFirestore(searchTarget)
    }
  })
})

//When click bookmark button this unhide the list
button.addEventListener("click", function () {
  popup.hidden = !popup.hidden
})

// async function saveBookmarkToFirestore(searchTarget, displayText) {
//   const user = auth.currentUser
//   if (!user) return

//   try {
//     const bookmarksRef = doc(db, "users", user.uid, "bookmarks", searchTarget)
//     await setDoc(bookmarksRef, {
//       searchTarget: searchTarget,
//       displayText: displayText,
//       createdAt: new Date().toISOString()
//     })
//   } catch (error) {
//     console.error("Error saving bookmark:", error)
//   }
// }

async function saveBookmarkToFirestore(
  searchTarget,
  displayText,
  coordinates = null
) {
  const user = auth.currentUser;
  if (!user) {
    window.alert("Please log in to save a bookmark.");
    return false;
  }

  const data = {
    searchTarget,
    displayText,
    createdAt: new Date().toISOString()
  };

  // Include coordinates when they are valid numbers.
  if (
    Number.isFinite(coordinates?.latitude) &&
    Number.isFinite(coordinates?.longitude)
  ) {
    data.latitude = coordinates.latitude;
    data.longitude = coordinates.longitude;
    const match = searchTarget.match(/^marked location (\d+)$/i);
    if (match) data.markedLocationNumber = Number(match[1]);
  }

  try {
    const bookmarkRef = doc(
      db,
      "users",
      user.uid,
      "bookmarks",
      searchTarget
    );

    await setDoc(bookmarkRef, data);
    return true;
  } catch (error) {
    console.error("Error saving bookmark:", error);
    return false;
  }
}

export async function renameLocationBookmark(searchTarget, name) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please log in to rename this bookmark.");
  const displayText = name.trim();
  if (!displayText) throw new Error("Enter a name for this location.");
  // Keep the document ID and original number when the display name changes.
  const data = { displayText };
  const match = searchTarget.match(/^marked location (\d+)$/i);
  if (match) data.markedLocationNumber = Number(match[1]);
  await updateDoc(doc(db, "users", user.uid, "bookmarks", searchTarget), data);
  await loadUserBookmarks(user);
  return displayText;
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
        addBookmarkToList(data.searchTarget, data.displayText, {
          latitude: data.latitude,
          longitude: data.longitude
        });
      }
    })
  } catch (error) {
    console.error("Error loading bookmarks:", error)
  }
}

// function addBookmarkToList(searchTarget, displayText) {
//   // Find the corresponding bookmark button
//   const targetButton = Array.from(bookmarkButton).find(btn => {
//     const text = btn.previousElementSibling.textContent.toLowerCase().trim()
//     return text === searchTarget
//   })

//   if (!targetButton) return
//   if (bookmarkItems.has(targetButton)) return

//   const icon = targetButton.querySelector("img")
//   if (!icon) return

//   icon.src = onIconPath

//   const item = document.createElement("li")
//   const anchor = document.createElement("a")
//   anchor.href = "#"
//   anchor.style.textDecoration = "none"
//   anchor.textContent = displayText
//   anchor.onclick = function (e) {
//     e.preventDefault()
//     searchRecent(searchTarget, false)
//   }
//   item.appendChild(anchor)
//   list.appendChild(item)

//   // Track this bookmark
//   bookmarkItems.set(targetButton, { item, searchTarget, text: displayText })
// }

function addBookmarkToList(searchTarget, displayText, coordinates = null) {
  const targetButton = Array.from(bookmarkButton).find(btn => {
    const text = btn.previousElementSibling.textContent
      .toLowerCase()
      .trim();

    return text === searchTarget;
  });

  if (targetButton && bookmarkItems.has(targetButton)) return;

  // Update an existing button when one is available.
  const icon = targetButton?.querySelector("img");

  if (icon) {
    icon.src = onIconPath;
  }

  // Always create the list entry, even without a matching button.
  const item = document.createElement("li");
  const anchor = document.createElement("a");

  anchor.href = "#";
  anchor.style.textDecoration = "none";
  anchor.textContent = displayText;

  anchor.onclick = function (event) {
    event.preventDefault();
    if (
      Number.isFinite(coordinates?.latitude) &&
      Number.isFinite(coordinates?.longitude)
    ) {
      window.dispatchEvent(new CustomEvent("show-bookmarked-location", {
        detail: {
          searchTarget,
          name: displayText,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude
        }
      }));
      popup.hidden = true;
    } else {
      searchRecent(searchTarget, false);
    }
  };

  item.appendChild(anchor);
  list.appendChild(item);

  if (targetButton) {
    bookmarkItems.set(targetButton, {
      item,
      searchTarget,
      text: displayText
    });
  }
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

export async function getNextMarkedLocationNumber() {
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user) return 1;

  const bookmarksRef = collection(
    db,
    "users",
    user.uid,
    "bookmarks"
  );

  const snapshot = await getDocs(bookmarksRef);

  let highestNumber = 0;

  snapshot.forEach((bookmarkDoc) => {
    const data = bookmarkDoc.data();
    const originalMatch = bookmarkDoc.id.match(/^marked location (\d+)$/i);
    if (Number.isInteger(data.markedLocationNumber)) {
      highestNumber = Math.max(highestNumber, data.markedLocationNumber);
      return;
    } else if (originalMatch) {
      highestNumber = Math.max(highestNumber, Number(originalMatch[1]));
      return;
    }
    const name = data.displayText || "";
    const match = name.trim().match(/^Marked location (\d+)$/i);

    if (match) {
      const number = Number(match[1]);
      highestNumber = Math.max(highestNumber, number);
    }
  });

  return highestNumber + 1;
}
