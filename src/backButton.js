// Make the browser/Android back button close whatever is open on the map
// (search sheet, location details, pin popup) instead of leaving the page.
export function setupBackButton({ isOpen, closeAll, watch }) {
  const guarded = () => history.state?.mapBackGuard === true;

  function arm() {
    if (isOpen() && !guarded()) history.pushState({ mapBackGuard: true }, "");
  }

  window.addEventListener("popstate", () => {
    if (guarded()) return;
    if (isOpen()) closeAll();
    else history.back();
  });

  const observer = new MutationObserver(arm);
  for (const [element, options] of watch) observer.observe(element, options);
}
