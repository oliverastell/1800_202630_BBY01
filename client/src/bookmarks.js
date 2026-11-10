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
const bookmarkButtonArray = []

// Track bookmarks by search text so they survive removal of a recent row.
const bookmarkItems = new Map()

function bookmarkButtonText(currentButton) {
  return currentButton.id === "bookmarkSelectedLocation"
    ? document.getElementById("aboutLocationTitle").textContent.trim()
    : currentButton.previousElementSibling.textContent.trim();
}

export function getCachedMarkedLocationNumber() {
  let highest = 0;
  for (const key of bookmarkItems.keys()) {
    const match = key.match(/^marked location (\d+)$/i);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

export function syncLocationBookmark(currentButton, name) {
  const target = name.toLowerCase().trim();
  const bookmark = bookmarkItems.get(target) || [...bookmarkItems.values()].find(
    item => item.text.toLowerCase().trim() === target
  );
  if (bookmark) currentButton.dataset.bookmarkKey = bookmark.searchTarget;
  else delete currentButton.dataset.bookmarkKey;
  currentButton.querySelector("img").src = bookmark ? onIconPath : offIconPath;
  currentButton.setAttribute("aria-pressed", String(!!bookmark));
  currentButton.setAttribute("aria-label", bookmark ? "Remove bookmark" : "Bookmark this location");
}

function bookmarkT(currentButton) {
  const icon = currentButton.querySelector("img");
  if (!icon) return;
  const searchTarget = bookmarkButtonText(currentButton).toLowerCase();
  if (currentButton.id !== "bookmarkSelectedLocation") icon.src = bookmarkItems.has(searchTarget) ? onIconPath : offIconPath;
  if (bookmarkButtonArray.includes(currentButton)) return;
  bookmarkButtonArray.push(currentButton);

  currentButton.addEventListener("click", async () => {
    const text = bookmarkButtonText(currentButton);
    if (currentButton.id === "bookmarkSelectedLocation") syncLocationBookmark(currentButton, text);
    const searchTarget = currentButton.dataset.bookmarkKey || text.toLowerCase();
    const bookmark = bookmarkItems.get(searchTarget);
    if (!bookmark) {
      const coordinates = {
        latitude: Number(currentButton.dataset.latitude),
        longitude: Number(currentButton.dataset.longitude)
      };
      const selectionVersion = currentButton.dataset.selectionVersion;
      currentButton.disabled = true;
      const saved = await saveBookmarkToFirestore(searchTarget, text, coordinates);
      if (currentButton.dataset.selectionVersion === selectionVersion) currentButton.disabled = false;
      if (saved) {
        addBookmarkToList(searchTarget, text, coordinates);
        window.dispatchEvent(new CustomEvent("location-bookmark-saved", {
          detail: { searchTarget, name: text, ...coordinates }
        }));
      }
    } else {
      currentButton.disabled = true;
      const removed = await removeBookmarkFromFirestore(searchTarget);
      currentButton.disabled = false;
      if (!removed) return;
      bookmark.item.remove();
      bookmarkItems.delete(searchTarget);
      bookmarkButtonArray.forEach(btn => {
        if (bookmarkButtonText(btn).toLowerCase() === searchTarget) {
          btn.querySelector("img").src = offIconPath;
        }
      });
      window.dispatchEvent(new CustomEvent("location-bookmark-removed", {
        detail: { searchTarget, name: text }
      }));
    }
  });
}

bookmarkButton.forEach(bookmarkT);

// Register bookmark buttons when new recent searches appear.
const recentObserver = new MutationObserver(() => {
  for (let i = bookmarkButtonArray.length - 1; i >= 0; i--) {
    if (!bookmarkButtonArray[i].isConnected) bookmarkButtonArray.splice(i, 1)
  }
  document.querySelectorAll(".bookmark-toggle").forEach(bookmarkT)
})
recentObserver.observe(document.getElementById("searchMenuResults"), {
  childList: true,
  subtree: true
})

Object.assign(window, { bookmarkT })
export { bookmarkT }

//When click bookmark button this unhide the list
button.addEventListener("click", function () {
  popup.hidden = !popup.hidden
})

async function saveBookmarkToFirestore(
  searchTarget,
  displayText,
  coordinates = null
) {
  searchTarget = searchTarget.toLowerCase().trim();
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
  searchTarget = searchTarget.toLowerCase().trim()
  const user = auth.currentUser
  if (!user) return

  try {
    const bookmarksRef = doc(db, "users", user.uid, "bookmarks", searchTarget)
    await deleteDoc(bookmarksRef)
    return true
  } catch (error) {
    console.error("Error removing bookmark:", error)
    return false
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
    window.dispatchEvent(new CustomEvent("bookmarks-loaded"));
  } catch (error) {
    console.error("Error loading bookmarks:", error)
  }
}

function addBookmarkToList(searchTarget, displayText, coordinates = null) {
  searchTarget = searchTarget.toLowerCase().trim();
  bookmarkButtonArray.forEach(btn => {
    if (btn.id !== "bookmarkSelectedLocation" && btn.previousElementSibling.textContent.toLowerCase().trim() === searchTarget) {
      btn.querySelector("img").src = onIconPath;
    }
  });
  if (bookmarkItems.has(searchTarget)) return;

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

  bookmarkItems.set(searchTarget, { item, searchTarget, text: displayText });
}


// Clear the bookmark list and reset icons
function clearBookmarkList() {
  list.innerHTML = ""
  bookmarkButtonArray.forEach(button => {
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
