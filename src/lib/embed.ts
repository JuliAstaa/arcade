/*
 * The contract with the portfolio, which opens a game in an iframe inside its
 * own popup: `?theme=light|dark&lang=en|id&embed=1` on the URL, a `ready` and a
 * `close` message up to the parent, and a `theme` message down from it. Without
 * the parameters a game is a standalone page in English that follows the
 * system theme.
 *
 * The theme from the URL is applied before first paint by a small script in
 * each page's <head>; this module handles everything after that.
 */

export type Lang = 'en' | 'id';
export type Theme = 'light' | 'dark';

/** Pages allowed to frame a game; the same list as the frame-ancestors header. */
const PARENTS = ['https://www.juliasta.my.id', 'https://juliasta.my.id', 'http://localhost:4321'];

const params = new URLSearchParams(location.search);

export const embedded = params.get('embed') === '1';
export const lang: Lang = params.get('lang') === 'id' ? 'id' : 'en';

export const setTheme = (theme: unknown) => {
	if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
};

/*
 * A message only reaches the parent when its origin is named, so it's looked up:
 * Chrome and Safari list the frame's ancestors, Firefox has the referrer (as long
 * as the iframe doesn't turn it off), and a message from the parent settles it.
 */
const referrer = (() => {
	try {
		return new URL(document.referrer).origin;
	} catch {
		return undefined;
	}
})();
let parentOrigin = [location.ancestorOrigins?.[0], referrer].find((origin) => origin && PARENTS.includes(origin));

const send = (type: 'ready' | 'close') => {
	if (embedded && parentOrigin && window.parent !== window) window.parent.postMessage({ source: 'arcade', type }, parentOrigin);
};

/** Tells the portfolio the game has loaded, so it can drop its fallback. */
export const ready = () => send('ready');

/** Asks the portfolio to close the popup; Esc inside the iframe never reaches its <dialog>. */
export const close = () => send('close');

if (embedded) {
	addEventListener('message', (event) => {
		if (event.source !== window.parent || !PARENTS.includes(event.origin)) return;
		parentOrigin = event.origin;
		const data = event.data;
		if (data?.source === 'portfolio' && data.type === 'theme') setTheme(data.theme);
	});
}
