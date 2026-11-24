import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, updateDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { confirmAction, promptRename } from "./alerts.js";

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
const emptyMessage = document.createElement("p");
emptyMessage.className = "bookmark-empty small text-body-secondary mb-0";
emptyMessage.textContent = "No bookmarks yet.";
popup.appendChild(emptyMessage);

//select every bookmark icon that is clickable
const bookmarkButton = document.querySelectorAll(".bookmark-toggle")
const bookmarkButtonArray = []

// Track bookmarks by search text so they survive removal of a recent row.
const bookmarkItems = new Map()

export function getPersonalBookmarks() {
  return [...bookmarkItems.values()];
}

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
  const bookmark = bookmarkItems.get(currentButton.dataset.bookmarkKey) || bookmarkItems.get(target) || [...bookmarkItems.values()].find(
    item => item.text.toLowerCase().trim() === target
  );
  if (bookmark) currentButton.dataset.bookmarkKey = bookmark.searchTarget;
  else delete currentButton.dataset.bookmarkKey;
  currentButton.querySelector("img").src = bookmark ? onIconPath : offIconPath;
  currentButton.setAttribute("aria-pressed", String(!!bookmark));
  currentButton.setAttribute("aria-label", bookmark ? "Remove bookmark" : "Bookmark this location");
  if (currentButton.id === "bookmarkSelectedLocation") { const editor = document.getElementById("selectedBookmarkEditor"); editor?.replaceChildren(...(bookmark ? [createBookmarkEditor(bookmark.searchTarget, bookmark.text, true)] : [])); }
}

function bookmarkT(currentButton) {
  const icon = currentButton.querySelector("img");
  if (!icon) return;
  const searchTarget = currentButton.dataset.bookmarkKey || bookmarkButtonText(currentButton).toLowerCase();
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
        buildingId: currentButton.dataset.buildingId,
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
      const confirmed = await confirmAction({
        title: "Remove bookmark?",
        text: `"${bookmark.text}" will be removed from your bookmarks.`,
        confirmText: "Remove",
        danger: true
      });
      if (!confirmed) return;
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

function setBookmarkMenuOpen(open) {
  popup.classList.toggle("popup-hidden", !open);
  popup.inert = !open;
  button.setAttribute("aria-expanded", String(open));
}

document.addEventListener("click", event => {
  // Clicking inside a confirmation dialog shouldn't close the bookmarks menu.
  if (event.target.closest?.(".swal2-container")) return;
  if (!popup.inert && !popup.contains(event.target) && !button.contains(event.target)) {
    setBookmarkMenuOpen(false);
  }
}, { capture: true });

button.parentElement.addEventListener("keydown", event => {
  if (event.key !== "Escape" || popup.inert) return;
  event.stopPropagation();
  setBookmarkMenuOpen(false);
  button.focus({ preventScroll: true });
});

// Replace the handler on hot reload so one click only toggles the menu once.
button.onclick = function (event) {
  event.stopPropagation();
  setBookmarkMenuOpen(popup.inert);
};

async function saveBookmarkToFirestore(
  searchTarget,
  displayText,
  coordinates = null
) {
  searchTarget = searchTarget.toLowerCase().trim();
  const user = auth.currentUser;
  if (!user) {
    confirmAction({
      title: "Log in to save bookmarks",
      text: "You need an account to keep bookmarks.",
      confirmText: "Log in"
    }).then(goToLogin => {
      if (goToLogin) window.location.href = "/login";
    });
    return false;
  }

  const data = {
    searchTarget,
    name: displayText,
    displayText,
    searchAliases: [displayText],
    createdAt: new Date().toISOString()
  };
  if (coordinates?.buildingId) data.buildingId = coordinates.buildingId;

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
  const data = { name: displayText, displayText, searchAliases: [displayText] };
  const match = searchTarget.match(/^marked location (\d+)$/i);
  if (match) data.markedLocationNumber = Number(match[1]);
  await updateDoc(doc(db, "users", user.uid, "bookmarks", searchTarget), data);
  await loadUserBookmarks(user);
  window.dispatchEvent(new CustomEvent("location-bookmark-renamed", {
    detail: { searchTarget, name: displayText }
  }));
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
    window.dispatchEvent(new CustomEvent("bookmarks-loaded"));
    return
  }

  try {
    const bookmarksRef = collection(db, "users", user.uid, "bookmarks")
    const snapshot = await getDocs(bookmarksRef)
    if (auth.currentUser?.uid !== user.uid) return;

    clearBookmarkList()

    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.searchTarget && (data.name || data.displayText)) {
        addBookmarkToList(data.searchTarget, data.name || data.displayText, {
          buildingId: data.buildingId,
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
    } else {
      searchRecent(searchTarget, false);
    }
    setBookmarkMenuOpen(false);
  };

  item.appendChild(anchor);
  item.className = "d-flex flex-wrap align-items-center gap-2 mb-2";
  anchor.className = "flex-grow-1 text-break";
  item.append(createBookmarkEditor(searchTarget, displayText));
  list.appendChild(item);

  bookmarkItems.set(searchTarget, { item, searchTarget, text: displayText, ...coordinates });
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
  clearBookmarkList();
  window.dispatchEvent(new CustomEvent("bookmarks-loaded"));
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

function createBookmarkEditor(searchTarget, displayText, directRename = false) {
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = directRename ? "btn btn-link border-0 bg-transparent text-dark p-0 ms-1 align-baseline" : "bookmark-edit-button";
  {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", "18");
    icon.setAttribute("height", "18");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m16 3 5 5M4 15 15.5 3.5a3.54 3.54 0 0 1 5 5L9 20l-6 1 1-6Z");
    icon.append(path);
    edit.append(icon);
  }
  edit.title = directRename ? "Modify name" : "Edit bookmark";
  edit.setAttribute("aria-label", `Edit ${displayText}`);
  edit.setAttribute("aria-expanded", "false");
  const actions = document.createElement("div");
  actions.className = "w-100";
  actions.hidden = true;
  function closeEditor() {
    actions.hidden = true;
    status.textContent = "";
    actions.replaceChildren(rename, remove, done, status);
    edit.classList.remove("d-none");
    edit.setAttribute("aria-expanded", "false");
    edit.focus();
  }
  async function renameBookmark() {
    await promptRename({
      title: "Rename bookmark",
      currentName: displayText,
      save: name => renameLocationBookmark(searchTarget, name)
    });
    if (!directRename && edit.isConnected) closeEditor();
  }
  edit.addEventListener("click", () => {
    if (directRename) {
      renameBookmark();
      return;
    }
    edit.classList.add("d-none");
    actions.hidden = !actions.hidden;
    edit.setAttribute("aria-expanded", String(!actions.hidden));
    rename.focus();
  });
  const rename = document.createElement("button");
  rename.type = "button";
  rename.className = "btn btn-sm btn-light me-2";
  rename.textContent = "Modify name";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-sm btn-outline-danger";
  remove.textContent = "Remove";
  const done = document.createElement("button");
  done.type = "button";
  done.className = "btn btn-sm btn-light ms-2";
  done.textContent = "Cancel";
  done.addEventListener("click", closeEditor);
  const status = document.createElement("div");
  status.className = "small text-danger";
  status.setAttribute("role", "status");
  rename.addEventListener("click", renameBookmark);
  remove.addEventListener("click", async () => {
    const confirmed = await confirmAction({
      title: "Remove bookmark?",
      text: `"${displayText}" will be removed from your bookmarks.`,
      confirmText: "Remove",
      danger: true
    });
    if (!confirmed) return;
    remove.disabled = rename.disabled = edit.disabled = true;
    if (!await removeBookmarkFromFirestore(searchTarget)) {
      status.textContent = "Could not remove the bookmark. Please try again.";
      remove.disabled = rename.disabled = edit.disabled = false;
      return;
    }
    bookmarkItems.get(searchTarget)?.item.remove();
    bookmarkItems.delete(searchTarget);
    bookmarkButtonArray.forEach(btn => {
      if (bookmarkButtonText(btn).toLowerCase() === searchTarget) {
        btn.querySelector("img").src = offIconPath;
      }
    });
    window.dispatchEvent(new CustomEvent("location-bookmark-removed", {
      detail: { searchTarget, name: displayText }
    }));
  });
  actions.append(rename, remove, done, status);
  const editor = document.createElement("span"); editor.className = "d-inline-block fs-6 fw-normal"; editor.append(edit, actions); return editor;

}
