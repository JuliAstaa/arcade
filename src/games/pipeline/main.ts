/*
 * Pipeline's page: the board of buttons, the HUD and the CI log, and a run of
 * levels against the clock. The rules live in board.ts; this file turns clicks
 * and keys into turns and draws what the trace says.
 *
 * Pipeline.astro has the markup; GameLayout (src/layouts/) the page around it.
 */

import { close, embedded, lang, ready } from '../../lib/embed';
import { read, write } from '../../lib/storage';
import { SHAPES, canTurn, generate, level, trace, type Board, type Kind, type Level, type Trace } from './board';
import { texts } from './i18n';

interface Best {
	/** Levels cleared in the run. */
	level: number;
	score: number;
	at: string;
}

type Phase = 'intro' | 'playing' | 'clearing' | 'over';

const BEST_KEY = 'pipeline:best';
/** The largest a tile gets, in px, so a small board doesn't fill the screen. */
const TILE_MAX = 84;
/** The smallest, for a finger. */
const TILE_MIN = 44;
/** Seconds left when the clock turns to the accent. */
const HURRY = 10;
/** Pacing of a cleared level, in ms: each tile of the line lighting up, each log line, the pause before the next. */
const RUN_STEP = 40;
const LOG_STEP = 260;
const NEXT_PAUSE = 700;
/** How long a turn animates, in ms (style.css); a win waits for the last one to land. */
const TURN = 200;

const t = texts[lang];
const narrow = matchMedia('(max-width: 559px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const clock = (seconds: number) => {
	const whole = Math.max(0, Math.floor(seconds));
	return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text) node.textContent = text;
	return node;
};

/** Sets text only when it changed, so a frame doesn't touch what it doesn't need to. */
const show = (node: HTMLElement, value: string) => {
	if (node.textContent !== value) node.textContent = value;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- Saved state and seeds ----------

const saved = read<Partial<Best>>(BEST_KEY);
let best = typeof saved?.level === 'number' && typeof saved.score === 'number' ? (saved as Best) : undefined;

// ?seed=a3f9 replays a run; otherwise each run gets its own.
const seedParam = new URLSearchParams(location.search).get('seed') ?? '';
const fixedSeed = /^[0-9a-f]{1,4}$/i.test(seedParam) ? parseInt(seedParam, 16) : undefined;
const newSeed = () => fixedSeed ?? Math.floor(Math.random() * 0x10000);
const hex = (seed: number) => seed.toString(16).padStart(4, '0');

// ---------- Elements ----------

const root = document.querySelector<HTMLElement>('[data-pipeline]')!;
const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const stats = {
	level: find('[data-stat="level"]'),
	time: find('[data-stat="time"]'),
	moves: find('[data-stat="moves"]'),
	best: find('[data-stat="best"]'),
};
const meter = find('[data-meter]');
const wrap = find('[data-wrap]');
const boardView = find('[data-board]');
const runLabel = find('[data-run]');
const routeView = find('[data-route]');
const log = find('[data-log]');
const intro = find('[data-screen="intro"]');
const over = find('[data-screen="over"]');
const startButton = find<HTMLButtonElement>('[data-start]');
const againButton = find<HTMLButtonElement>('[data-again]');
const restartButton = find<HTMLButtonElement>('[data-restart]');
const results = {
	cleared: find('[data-result="cleared"]'),
	score: find('[data-result="score"]'),
	best: find('[data-result="best"]'),
	fresh: find('[data-result="new"]'),
};
const hints = find('[data-hints]');
const announce = find('[data-announce]');

// ---------- Language ----------

const lookup = (path: string) =>
	path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], t);

for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
	const value = lookup(node.dataset.i18n!);
	if (typeof value === 'string') node.textContent = value;
}
for (const node of root.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
	const value = lookup(node.dataset.i18nLabel!);
	if (typeof value === 'string') node.setAttribute('aria-label', value);
}
document.title = `${t.title} · Arcade`;

find('[data-rules]').replaceChildren(
	...t.rules.map(({ key, text }) => {
		const rule = element('li', 'pipeline__rule');
		rule.append(element('span', 'pipeline__key', key), element('span', '', text));
		return rule;
	}),
);

const keyHint = (keys: string[], label: string) => {
	const item = element('span', 'pipeline__hint');
	item.append(...keys.map((key) => element('kbd', '', key)), element('span', '', label));
	return item;
};
hints.replaceChildren(
	keyHint([t.keys.click, t.keys.space], t.keys.turn),
	keyHint(['shift', t.keys.click], t.keys.back),
	keyHint(['↑↓←→'], t.keys.move),
	keyHint(['R'], t.keys.restart),
	...(embedded ? [keyHint(['esc'], t.keys.close)] : []),
);

// ---------- The board ----------

let phase: Phase = 'intro';
let runSeed = newSeed();
let spec: Level;
let board: Board;
let current: Trace;
let tiles: HTMLButtonElement[] = [];
let cursor = 0;
let moves = 0;
let score = 0;
let cleared = 0;
/** When the level's CI budget runs out, on the performance.now() clock. */
let endsAt = 0;
/** Seconds left, frozen while a cleared level plays out. */
let left = 0;
let frame = 0;
let hintLine: HTMLElement | undefined;

const setPhase = (next: Phase) => {
	phase = next;
	root.dataset.phase = next;
};

const SVG = 'http://www.w3.org/2000/svg';
/** Where each direction's opening meets the tile's edge, in the 100×100 drawing. */
const EDGES = ['50 0', '100 50', '50 100', '0 50'];

/** A piece as drawn before turning: a pipe from the centre to each opening, with a hub where they meet. */
const drawPiece = (kind: Kind) => {
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('viewBox', '0 0 100 100');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('tile__pipe');
	const mask = SHAPES[kind];
	const pipe = document.createElementNS(SVG, 'path');
	pipe.setAttribute('d', EDGES.filter((_, dir) => mask & (1 << dir)).map((edge) => `M50 50L${edge}`).join(''));
	svg.append(pipe);
	if (kind === 'end') {
		const cap = document.createElementNS(SVG, 'circle');
		cap.setAttribute('cx', '50');
		cap.setAttribute('cy', '50');
		cap.setAttribute('r', '15');
		svg.append(cap);
	} else if (kind === 'corner' || kind === 'tee' || kind === 'cross') {
		const hub = document.createElementNS(SVG, 'rect');
		for (const [name, value] of [['x', '41'], ['y', '41'], ['width', '18'], ['height', '18']]) hub.setAttribute(name, value);
		svg.append(hub);
	}
	return svg;
};

const drawTurn = (cell: number) => {
	const svg = tiles[cell].querySelector<SVGElement>('.tile__pipe')!;
	svg.style.transform = `rotate(${board.tiles[cell].turns * 90}deg)`;
	tiles[cell].dataset.turns = String(((board.tiles[cell].turns % 4) + 4) % 4);
};

const drawBoard = () => {
	tiles = board.tiles.map((tile, cell) => {
		const button = element('button', 'tile');
		button.type = 'button';
		button.tabIndex = -1;
		button.dataset.cell = String(cell);
		button.dataset.kind = tile.kind;
		if (tile.fixed) button.dataset.fixed = '';
		if (tile.locked) button.dataset.locked = '';
		if (!canTurn(tile)) button.setAttribute('aria-disabled', 'true');
		button.append(drawPiece(tile.kind));
		if (tile.fixed) button.append(element('span', 'tile__label', t.pieces[tile.kind]));
		return button;
	});
	boardView.style.setProperty('--n', String(board.size));
	boardView.replaceChildren(...tiles);
	for (const cell of tiles.keys()) drawTurn(cell);
	cursor = board.push;
	tiles[cursor].tabIndex = 0;
	fitBoard();
};

/** The board as big as its box allows, a tile between TILE_MIN and TILE_MAX. */
const fitBoard = () => {
	if (!board) return;
	const n = board.size;
	// Stacked on a phone, the board takes the width; beside the log, the smaller of width and height.
	const room = narrow.matches ? wrap.clientWidth : Math.min(wrap.clientWidth, wrap.clientHeight);
	const size = Math.min(room, n * TILE_MAX + n + 1);
	boardView.style.setProperty('--board', `${Math.floor(Math.max(size, n * TILE_MIN + n + 1))}px`);
};

/** Re-traces the line: lit pipes, the stages it has reached, and a hint if it reaches PROD the wrong way. */
const paint = () => {
	current = trace(board);
	const n = board.size;
	tiles.forEach((button, cell) => {
		const lit = current.lit.has(cell);
		button.toggleAttribute('data-lit', lit);
		const tile = board.tiles[cell];
		const states = [...(tile.locked ? [t.states.locked] : []), ...(lit && tile.kind !== 'empty' ? [t.states.lit] : [])];
		button.setAttribute('aria-label', t.tile(Math.floor(cell / n) + 1, (cell % n) + 1, t.pieces[tile.kind], states));
	});
	for (const step of routeView.querySelectorAll<HTMLElement>('[data-step]')) {
		const kind = step.dataset.step as Kind;
		const cell = board.tiles.findIndex((tile) => tile.kind === kind);
		step.toggleAttribute('data-lit', current.lit.has(cell));
	}

	const hint = current.hint
		? current.hint.type === 'missing'
			? t.hints.missing[current.hint.stage]
			: current.hint.type === 'order'
				? t.hints.order(current.hint.early, current.hint.late)
				: t.hints.through
		: '';
	if (!hint) {
		hintLine?.remove();
		hintLine = undefined;
	} else if (hintLine?.textContent !== `✗ ${hint}`) {
		hintLine?.remove();
		hintLine = logLine(`✗ ${hint}`, 'bad');
	}
};

const logLine = (text: string, tone?: 'ok' | 'bad') => {
	const line = element('p', 'pipeline__line', text);
	if (tone) line.dataset.tone = tone;
	log.append(line);
	while (log.childElementCount > 8) log.firstElementChild!.remove();
	return line;
};

// ---------- HUD and clock ----------

const drawStats = () => {
	show(stats.level, String(spec.number));
	show(stats.time, clock(Math.ceil(left)));
	show(stats.moves, String(moves));
	show(stats.best, best ? String(best.level) : '–');
	meter.style.transform = `scaleX(${Math.max(0, Math.min(1, left / spec.seconds))})`;
	root.toggleAttribute('data-hurry', phase === 'playing' && left <= HURRY);
};

const tick = () => {
	if (phase !== 'playing') return;
	left = (endsAt - performance.now()) / 1000;
	if (left <= 0) return timeout();
	drawStats();
	frame = requestAnimationFrame(tick);
};

const stopClock = () => {
	cancelAnimationFrame(frame);
	frame = 0;
};

// ---------- Levels and runs ----------

/** Sets up level `number`; with `play`, its CI budget starts at once. */
const loadLevel = (number: number, play = true) => {
	spec = level(number);
	board = generate(spec, runSeed);
	moves = 0;
	left = spec.seconds;
	hintLine = undefined;
	const hadFocus = boardView.contains(document.activeElement);
	drawBoard();
	show(runLabel, `${t.run(hex(runSeed))} · ${t.grid(spec.size)}`);
	routeView.replaceChildren(
		...(['push', ...spec.stages, 'prod'] as Kind[]).map((kind) => {
			const step = element('li', 'pipeline__step', t.pieces[kind]);
			step.dataset.step = kind;
			return step;
		}),
	);
	log.replaceChildren();
	logLine(t.log.start);
	paint();
	if (play) {
		setPhase('playing');
		endsAt = performance.now() + spec.seconds * 1000;
		stopClock();
		frame = requestAnimationFrame(tick);
	}
	drawStats();
	if (hadFocus) focusTile(cursor);
};

/** R: the level as it was dealt, same scramble; the clock keeps running. */
const restartLevel = () => {
	if (phase !== 'playing') return;
	const hadFocus = boardView.contains(document.activeElement);
	board = generate(spec, runSeed);
	moves = 0;
	hintLine?.remove();
	hintLine = undefined;
	const previous = cursor;
	drawBoard();
	tiles[cursor].tabIndex = -1;
	cursor = previous;
	tiles[cursor].tabIndex = 0;
	logLine(t.log.restart);
	paint();
	drawStats();
	if (hadFocus) focusTile(cursor);
};

const startRun = (seed: number) => {
	runSeed = seed;
	score = 0;
	cleared = 0;
	intro.hidden = true;
	over.hidden = true;
	loadLevel(1);
	focusTile(cursor);
};

/** The line ships: it runs PUSH to PROD in the accent, the CI log ticks through, then the next level. */
const clear = async () => {
	setPhase('clearing');
	left = Math.max(0, (endsAt - performance.now()) / 1000);
	score += Math.ceil(left);
	cleared = spec.number;
	stopClock();
	drawStats();
	const number = spec.number;
	const step = reducedMotion.matches ? 0 : RUN_STEP;
	await wait(reducedMotion.matches ? 0 : TURN);
	current.path.forEach((cell, index) => setTimeout(() => tiles[cell]?.setAttribute('data-run', ''), index * step));
	await wait(current.path.length * step);
	for (const stage of spec.stages) {
		logLine(t.log.passed(stage), 'ok');
		await wait(LOG_STEP);
	}
	logLine(t.log.shipped, 'ok');
	show(announce, t.announce.cleared(number));
	await wait(NEXT_PAUSE);
	if (phase === 'clearing' && spec.number === number) loadLevel(number + 1);
};

const timeout = () => {
	setPhase('over');
	stopClock();
	left = 0;
	drawStats();
	logLine(`✗ ${t.log.timeout}`, 'bad');

	const fresh = cleared > 0 && (!best || cleared > best.level || (cleared === best.level && score > best.score));
	if (fresh) {
		best = { level: cleared, score, at: new Date().toISOString() };
		write(BEST_KEY, best);
		drawStats();
	}
	show(results.cleared, String(cleared));
	show(results.score, String(score));
	show(results.best, best ? t.over.level(best.level) : '–');
	results.fresh.hidden = !fresh;
	over.hidden = false;
	// The card takes the focus, not its button, so keys still being pressed when time runs out land on nothing.
	over.focus({ preventScroll: true });
	show(announce, t.announce.over(cleared, score));
};

// ---------- Turning ----------

const cellOf = (target: EventTarget | null) => {
	const tile = (target as HTMLElement | null)?.closest<HTMLElement>('.tile');
	return tile ? Number(tile.dataset.cell) : -1;
};

const focusTile = (cell: number) => {
	tiles[cursor]?.setAttribute('tabindex', '-1');
	cursor = cell;
	tiles[cell].tabIndex = 0;
	tiles[cell].focus();
};

/** A tile that can't turn shakes its head. */
const refuse = (cell: number) => {
	const button = tiles[cell];
	button.removeAttribute('data-refused');
	void button.offsetWidth;
	button.setAttribute('data-refused', '');
};

const turnTile = (cell: number, dir: 1 | -1) => {
	if (phase !== 'playing') return;
	const tile = board.tiles[cell];
	if (!canTurn(tile)) return refuse(cell);
	tile.turns += dir;
	moves++;
	drawTurn(cell);
	paint();
	drawStats();
	if (current.won) void clear();
};

boardView.addEventListener('click', (event) => {
	// A key's own click; its keydown has turned the tile already.
	if (event.detail === 0) return;
	const cell = cellOf(event.target);
	if (cell < 0) return;
	tiles[cursor].tabIndex = -1;
	cursor = cell;
	tiles[cell].tabIndex = 0;
	turnTile(cell, event.shiftKey ? -1 : 1);
});

// Right-click turns back; so does a long press on Android, which opens the same menu.
boardView.addEventListener('contextmenu', (event) => {
	const cell = cellOf(event.target);
	if (cell < 0) return;
	event.preventDefault();
	turnTile(cell, -1);
});

const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

boardView.addEventListener('keydown', (event) => {
	const cell = cellOf(event.target);
	if (cell < 0) return;
	const arrow = ARROWS[event.key];
	if (arrow) {
		event.preventDefault();
		const n = board.size;
		const x = Math.min(n - 1, Math.max(0, (cell % n) + arrow[0]));
		const y = Math.min(n - 1, Math.max(0, Math.floor(cell / n) + arrow[1]));
		focusTile(y * n + x);
	} else if (event.key === ' ' || event.key === 'Enter') {
		event.preventDefault();
		turnTile(cell, event.shiftKey ? -1 : 1);
	}
});

// Space would also click the button when it's let go.
boardView.addEventListener('keyup', (event) => {
	if (event.key === ' ') event.preventDefault();
});

addEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		if (!embedded) return;
		event.preventDefault();
		close();
		return;
	}
	if (phase !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
	if (event.key === 'r' || event.key === 'R') {
		event.preventDefault();
		restartLevel();
	} else if (ARROWS[event.key] && cellOf(event.target) < 0) {
		// Arrows anywhere else pick the board back up where the cursor was.
		event.preventDefault();
		focusTile(cursor);
	}
});

startButton.addEventListener('click', () => startRun(runSeed));
againButton.addEventListener('click', () => startRun(newSeed()));
restartButton.addEventListener('click', restartLevel);

new ResizeObserver(fitBoard).observe(wrap);
narrow.addEventListener('change', fitBoard);

// ---------- Go ----------

// Level 1 is dealt behind the rules; the clock starts with the run.
loadLevel(1, false);
startButton.focus({ preventScroll: true });
ready();
