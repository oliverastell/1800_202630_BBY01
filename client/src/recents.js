import { onAuthReady } from "./homeAuth.js";
import { bookmarkT } from "./bookmarks.js";
import { auth, db } from "./firebaseConfig.js";
import { doc, setDoc, collection, getDocs, deleteDoc} from "firebase/firestore";


const searchMenuResults = document.getElementById("searchMenuResults");

onAuthReady(async (user) => {
    const rsDoc = collection(db, "users", user.uid, "recentSearches");
    const userDoc = await getDocs(rsDoc);
    const userInfo = userDoc;

    const recentSearchlist = userInfo;


    recentSearchlist.forEach((doc) => {

        addToRecent(doc.data().searchTarget);
        function addToRecent(name){
            let newRow = document.createElement("div");
            newRow.setAttribute("class", "list-group-item p-0 d-flex align-items-center gap-2 border-0 rounded-pill bg-light overflow-hidden recent-search-row");
            let newSearch = document.createElement("button");
            newSearch.setAttribute("type", "button");
            newSearch.setAttribute("class", "btn list-group-item-action text-start text-dark text-break w-100 border-0 rounded-pill py-3 ps-3 pe-5");
            newSearch.setAttribute("onclick", "searchRecent('" + name + "')");
            newSearch.textContent = name;
            newRow.appendChild(newSearch)
            let bookmarkButton = document.createElement("button");
            bookmarkButton.setAttribute("type", "button");
            bookmarkButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 bookmark-toggle recent-search-action");
            let bookmarkIcon = document.createElement("img");
            bookmarkIcon.setAttribute("src", "/res/img/bookmark-icon.svg");
            bookmarkIcon.setAttribute("alt", "Bookmark Icon");
            bookmarkIcon.setAttribute("width", "20");
            bookmarkIcon.setAttribute("height", "24");
            bookmarkButton.appendChild(bookmarkIcon);
            newRow.append(bookmarkButton);
            bookmarkT(bookmarkButton);
            let xButton = document.createElement("button");
            xButton.setAttribute("type", "button");
            xButton.setAttribute("class", "btn border-0 rounded-circle flex-shrink-0 p-0 recent-search-action");
            xButton.textContent = "X";
    xButton.setAttribute("aria-label", "Remove recent search");
            xButton.setAttribute("onclick", "removeFromRecent(this)");
            newRow.append(xButton)
            searchMenuResults.insertBefore(newRow, searchMenuResults.firstChild);
        }
    })
});   

const searchForm = document.getElementById("searchForm");


function search(){
    const searchText = document.getElementById("searchField").value.trim().toLowerCase();
    addtoRecentFS(searchText,searchText);
}

async function addtoRecentFS(searchTarget, displayText) {
    searchTarget = searchTarget.toLowerCase().trim()
    const user = auth.currentUser
    if (!user) return
    try {
        const recentRef = doc(db, "users", user.uid, "recentSearches", searchTarget)
        await setDoc(recentRef, {
        searchTarget: searchTarget,
        displayText: displayText,
        createdAt: new Date().toISOString()
    })
  } catch (error) {
        console.error("Error saving recent search:", error)
  }
}

async function removeRecentSearchFromFirestore(searchTarget) {
  searchTarget = searchTarget.toLowerCase().trim()
  const user = auth.currentUser
  if (!user) return

  try {
    const recentRef = doc(db, "users", user.uid, "recentSearches", searchTarget)
    await deleteDoc(recentRef)
    //console.log(`Removed recent search '${searchTarget}' from Firestore`)
  } catch (error) {
    console.error("Error removing recent search:", error)
  }
}


Object.assign(window, {removeRecentSearchFromFirestore,addtoRecentFS})

searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    search();
});
