export const THEME_STORAGE_KEY = "pl-theme";

/** Runs before first paint (inlined in <head>) so a saved choice never flashes the wrong theme. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;
