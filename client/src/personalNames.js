const normalize = value => value?.trim().toLowerCase() ?? "";

export function bookmarkForBuilding(building, bookmarks) {
  const keys = [building.id, building.name, ...building.searchAliases].map(normalize);
  return bookmarks.find(bookmark => bookmark.buildingId === building.id
    || keys.includes(normalize(bookmark.searchTarget)));
}

export function searchLocations(query, buildings, bookmarks) {
  const text = normalize(query);
  return [
    ...buildings.map(building => {
      const bookmark = bookmarkForBuilding(building, bookmarks);
      return { key: building.id, name: bookmark?.text ?? building.name, building, bookmark,
        aliases: [building.id, building.name, ...building.searchAliases, bookmark?.text].filter(Boolean) };
    }),
    ...bookmarks.filter(bookmark => !buildings.some(building => bookmarkForBuilding(building, [bookmark])))
      .map(bookmark => ({ key: bookmark.searchTarget, name: bookmark.text, bookmark,
        aliases: [bookmark.text, bookmark.searchTarget] }))
  ].filter(location => !text || location.aliases.some(alias => normalize(alias).includes(text)));
}
