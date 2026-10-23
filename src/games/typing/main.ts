/*
 * The typing test's page: mode and round pickers, the text with its caret,
 * live stats, and the result card with a personal best per mode. The typing
 * rules live in engine.ts; this file feeds it keys and draws what it says.
 *
 * Keys come from a transparent textarea laid over the text, so a tap opens a
 * phone's keyboard. Phone keyboards often compose words instead of sending
 * keys, so the field's value is compared with what was last seen and only the
 * difference is typed; outside a composition the field is emptied every time.
 *
 * Typing.astro has the markup; GameLayout (src/layouts/) the page around it.
 */

import { close, embedded, lang, ready, type Lang } from '../../lib/embed';
import { read, write } from '../../lib/storage';
import { pickSnippet, tidy, type CodeLang, type Snippet } from './content/code';
import { pickCommands } from './content/shell';
import { pickWords } from './content/words';
import { createRun, type Mode, type Result, type Run } from './engine';
import { texts } from './i18n';

type Seconds = 15 | 30 | 60;
type CodeChoice = CodeLang | 'mix';

interface Settings {
	mode: Mode;
	/** The language of the words, picked in the game; the page's own language only sets the first default. */
	words: Lang;
	seconds: Seconds;
	code: CodeChoice;
}

interface Best {
	wpm: number;
	accuracy: number;
	at: string;
}

const SETTINGS_KEY = 'typing:settings';
const BEST_KEY = 'typing:best';
const MODES: Mode[] = ['words', 'code', 'shell'];
const LANGS: Lang[] = ['en', 'id'];
const DURATIONS: Seconds[] = [15, 30, 60];
const CODE_CHOICES: CodeChoice[] = ['mix', 'go', 'python', 'sql'];
/** Commands in a `shell` round. */
const COMMANDS = 6;
/** Words in a `words` round, enough for 300 wpm. */
const WORDS_PER_SECOND = 5;
/** Keys shown under most-missed. */
const MISSED = 5;
/** Seconds left when the clock turns to the accent. */
const HURRY = 5;

const t = texts[lang];
const fine = matchMedia('(pointer: fine)');

const oneOf = <T>(value: unknown, options: readonly T[], fallback: T): T =>
	options.includes(value as T) ? (value as T) : fallback;

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

// ---------- Saved state ----------

const saved = read<Partial<Settings>>(SETTINGS_KEY) ?? {};
const settings: Settings = {
	mode: oneOf(saved.mode, MODES, 'words'),
	words: oneOf(saved.words, LANGS, lang),
	seconds: oneOf(saved.seconds, DURATIONS, 30),
	code: oneOf(saved.code, CODE_CHOICES, 'mix'),
};

const bests: Record<string, Best> = {};
for (const [key, best] of Object.entries(read<Record<string, Best>>(BEST_KEY) ?? {})) {
	if (typeof best?.wpm === 'number' && typeof best.accuracy === 'number') bests[key] = best;
}

/** Personal bests are kept per mode, and per language and round length in `words`. */
const bestKey = () => (settings.mode === 'words' ? `words:${settings.words}:${settings.seconds}` : settings.mode);

// ---------- Elements ----------

const root = document.querySelector<HTMLElement>('[data-typing]')!;
const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const modes = find('[data-modes]');
const end = find('[data-end]');
const langs = find('[data-langs]');
const options = find('[data-options]');
const stats = {
	time: find('[data-stat="time"]'),
	wpm: find('[data-stat="wpm"]'),
	accuracy: find('[data-stat="accuracy"]'),
	best: find('[data-stat="best"]'),
};
const meter = find('[data-meter]');
const sourceLabel = find('[data-source]');
const sourceText = find('[data-source-text]');
const box = find('[data-text]');
const inner = find('[data-inner]');
const input = find<HTMLTextAreaElement>('[data-input]');
const focusHint = find('[data-focus]');
const resultCard = find('[data-result]');
const scores = {
	wpm: find('[data-score="wpm"]'),
	raw: find('[data-score="raw"]'),
	accuracy: find('[data-score="accuracy"]'),
	time: find('[data-score="time"]'),
	chars: find('[data-score="chars"]'),
};
const bestLine = find('[data-best]');
const missedKeys = find('[data-missed]');
const nextButton = find<HTMLButtonElement>('[data-next]');
const retryButton = find<HTMLButtonElement>('[data-retry]');
const restartButton = find<HTMLButtonElement>('[data-restart]');
const hints = find('[data-hints]');
const announce = find('[data-announce]');
const caret = element('span', 'typing__caret');

// ---------- Language ----------

const lookup = (path: string) =>
	path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], t);

for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
	const value = lookup(node.dataset.i18n!);
	if (typeof value === 'string') node.textContent = value;
}
for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
	const value = lookup(node.dataset.i18nLabel!);
	if (typeof value === 'string') node.setAttribute('aria-label', value);
}
document.title = `${t.title} · Arcade`;
scores.chars.title = t.result.charsTitle;

// ---------- Pickers ----------

const drawPickers = () => {
	root.dataset.mode = settings.mode;
	for (const button of modes.querySelectorAll<HTMLButtonElement>('[data-set-mode]')) {
		button.setAttribute('aria-pressed', String(button.dataset.setMode === settings.mode));
	}

	const pick = (className: string, kind: string, value: string, label: string, on: boolean) => {
		const button = element('button', className, label);
		button.type = 'button';
		button.dataset.kind = kind;
		button.dataset.option = value;
		button.setAttribute('aria-pressed', String(on));
		return button;
	};

	// `words` picks the words' language (EN / ID, like the navbar's switch) and the round's length;
	// `code` picks a language; `shell` has nothing to pick.
	langs.hidden = settings.mode !== 'words';
	langs.replaceChildren(
		...LANGS.flatMap((code, index) => {
			const button = pick('typing__lang', 'words', code, code, code === settings.words);
			button.setAttribute('aria-label', t.wordsIn[code]);
			button.title = t.wordsIn[code];
			const separator = element('span', 'typing__sep', '/');
			separator.setAttribute('aria-hidden', 'true');
			return index ? [separator, button] : [button];
		}),
	);
	const choices =
		settings.mode === 'words'
			? DURATIONS.map((seconds) => pick('typing__tab', 'seconds', String(seconds), `${seconds}s`, seconds === settings.seconds))
			: settings.mode === 'code'
				? CODE_CHOICES.map((code) => pick('typing__tab', 'code', code, code === 'mix' ? t.mix : code, code === settings.code))
				: [];
	options.hidden = !choices.length;
	options.replaceChildren(...choices);
	end.hidden = langs.hidden && options.hidden;

	const key = (name: string) => element('kbd', '', name);
	const hint = (keys: string[], label: string) => {
		const item = element('span', 'typing__hint');
		item.append(...keys.map(key), element('span', '', label));
		return item;
	};
	hints.replaceChildren(
		hint([settings.mode === 'words' ? t.keys.space : t.keys.enter], t.hints[settings.mode]),
		hint(['tab', 'enter'], t.hints.restart),
		...(embedded ? [hint(['esc'], t.hints.close)] : []),
	);
};

const remember = () => write(SETTINGS_KEY, settings);

modes.addEventListener('click', (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-set-mode]');
	if (!button) return;
	settings.mode = oneOf(button.dataset.setMode, MODES, settings.mode);
	remember();
	drawPickers();
	start();
	input.focus();
});

end.addEventListener('click', (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-option]');
	if (!button) return;
	const value = button.dataset.option;
	if (button.dataset.kind === 'words') settings.words = oneOf(value, LANGS, settings.words);
	else if (button.dataset.kind === 'seconds') settings.seconds = oneOf(Number(value), DURATIONS, settings.seconds);
	else settings.code = oneOf(value, CODE_CHOICES, settings.code);
	remember();
	drawPickers();
	start();
	input.focus();
});

// ---------- The text ----------

let run: Run;
let source = { text: '', label: '' };
let lastSnippet: Snippet | undefined;
let spans: HTMLSpanElement[] = [];
/** The extras drawn at each boundary, by its position. */
const extraSpans = new Map<number, HTMLSpanElement[]>();
/** Lines scrolled out of view above the text box. */
let scrolled = 0;
/** The line the caret is on, to tell a step along it from a move to another. */
let caretLine = -1;
let frame = 0;
let over = false;

const makeSource = () => {
	if (settings.mode === 'words') {
		const text = pickWords(settings.words, settings.seconds * WORDS_PER_SECOND).join(' ');
		return { text, label: t.source.words[settings.words] };
	}
	if (settings.mode === 'code') {
		lastSnippet = pickSnippet(settings.code, lastSnippet);
		return { text: tidy(lastSnippet.code), label: lastSnippet.file };
	}
	// Each command ends with enter, as if run, the last one too.
	return { text: `${pickCommands(COMMANDS).join('\n')}\n`, label: t.source.shell };
};

const charSpan = (char: string) => {
	const span = element('span', 'ch');
	if (char === ' ') span.classList.add('ch--space');
	if (char === '\n') span.classList.add('ch--enter');
	span.textContent = char === '\n' ? '↵' : char;
	span.dataset.mark = 'todo';
	return span;
};

/** Words wrap as wholes; the spaces between them are where lines break. */
const drawWords = (chars: string[]) => {
	let word: HTMLElement | undefined;
	for (const char of chars) {
		const span = charSpan(char);
		spans.push(span);
		if (char === ' ') {
			inner.append(span);
			word = undefined;
		} else {
			if (!word) inner.append((word = element('span', 'word')));
			word.append(span);
		}
	}
};

/** Code and commands keep their lines; a long one wraps, under its own indentation, rather than scrolling sideways. */
const drawLines = (chars: string[]) => {
	const newLine = (start: number) => {
		const line = inner.appendChild(element('div', 'line'));
		let indent = 0;
		while (chars[start + indent] === ' ') indent++;
		if (indent) line.style.setProperty('--indent', `${indent}ch`);
		return line;
	};
	let line = newLine(0);
	chars.forEach((char, index) => {
		const span = charSpan(char);
		spans.push(span);
		line.append(span);
		if (char === '\n' && index < chars.length - 1) line = newLine(index + 1);
	});
};

/** Brings the marks of positions `from` to `to` up to date. */
const paint = (from: number, to: number) => {
	for (let index = Math.max(0, from); index <= Math.min(to, spans.length - 1); index++) {
		const mark = run.marks[index];
		if (spans[index].dataset.mark !== mark) spans[index].dataset.mark = mark;
	}
};

/**
 * Brings the extras at the boundary at `index` up to date. They only grow and
 * shrink at the end, so the spans already there stay. In `words` they go inside
 * the word, so it still wraps as a whole; on a line, before its line break.
 */
const drawExtras = (index: number) => {
	const want = run.extras.get(index) ?? [];
	const have = extraSpans.get(index) ?? [];
	while (have.length > want.length) have.pop()!.remove();
	while (have.length < want.length) {
		const span = charSpan(want[have.length]);
		span.classList.add('ch--extra');
		span.dataset.mark = 'wrong';
		if (settings.mode === 'words') (have.at(-1) ?? spans[index - 1]).after(span);
		else spans[index].before(span);
		have.push(span);
	}
	if (have.length) extraSpans.set(index, have);
	else extraSpans.delete(index);
};

// ---------- Caret ----------

/*
 * Along a line the caret follows the cursor on a critically damped spring: it
 * speeds up and settles without overshooting, and a key pressed mid-glide bends
 * its path instead of starting a new move, so steady typing reads as one motion.
 */

/** How tightly the caret follows, per second; higher is snappier. Halfway in ~40ms, nine tenths in ~95ms. */
const SPRING = 42;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const glide = { x: 0, y: 0, velocity: 0, target: 0, last: 0, frame: 0 };

const drawCaret = () => {
	caret.style.transform = `translate(${glide.x.toFixed(2)}px, ${glide.y}px)`;
};

const stepCaret = (now: number) => {
	// The first frame of a move has no previous one to measure from.
	let left = glide.last ? Math.min(0.05, (now - glide.last) / 1000) : 1 / 60;
	glide.last = now;
	// Small steps keep the spring steady through a slow frame.
	while (left > 0) {
		const step = Math.min(left, 1 / 240);
		const pull = SPRING * SPRING * (glide.target - glide.x) - 2 * SPRING * glide.velocity;
		glide.velocity += pull * step;
		glide.x += glide.velocity * step;
		left -= step;
	}
	const settled = Math.abs(glide.target - glide.x) < 0.25 && Math.abs(glide.velocity) < 4;
	if (settled) {
		glide.x = glide.target;
		glide.velocity = 0;
		glide.frame = 0;
	} else glide.frame = requestAnimationFrame(stepCaret);
	drawCaret();
};

const moveCaret = (x: number, y: number, jump: boolean) => {
	glide.target = x;
	glide.y = y;
	if (jump || reducedMotion.matches) {
		cancelAnimationFrame(glide.frame);
		Object.assign(glide, { x, velocity: 0, frame: 0 });
		drawCaret();
	} else if (!glide.frame) {
		glide.last = 0;
		glide.frame = requestAnimationFrame(stepCaret);
	}
};

/** Moves the caret to the cursor and scrolls the text so its line, and some after it, stay in view. */
const place = () => {
	const span = spans[run.pos];
	caret.hidden = !span;
	if (!span) return;
	const height = parseFloat(getComputedStyle(inner).lineHeight);
	const line = Math.floor((span.offsetTop + span.offsetHeight / 2) / height);

	// Along a line the caret glides; onto another it jumps, rather than sweeping back across the text.
	const jump = line !== caretLine;
	caretLine = line;
	moveCaret(span.offsetLeft, line * height, jump);

	// One line kept above the caret, and one to three below, depending on how many fit.
	const rows = Math.max(1, Math.floor(box.clientHeight / height));
	const top = rows > 2 ? 1 : 0;
	const bottom = Math.max(top, rows - 1 - (rows >= 6 ? 3 : 1));
	if (line - scrolled > bottom) scrolled = line - bottom;
	else if (line - scrolled < top) scrolled = Math.max(0, line - top);
	inner.style.transform = `translateY(${-scrolled * height}px)`;
};

// ---------- Stats ----------

const timed = () => settings.mode === 'words';

const drawStats = () => {
	const seconds = run.elapsed();
	const live = run.result(seconds);
	const left = settings.seconds - seconds;
	show(stats.time, timed() ? clock(Math.ceil(left)) : clock(seconds));
	show(stats.wpm, seconds >= 1 ? String(Math.round(live.wpm)) : '0');
	show(stats.accuracy, `${Math.floor(live.accuracy * 100)}%`);
	const best = bests[bestKey()];
	show(stats.best, best ? String(best.wpm) : '–');
	const progress = timed() ? seconds / settings.seconds : run.pos / run.chars.length;
	meter.style.transform = `scaleX(${Math.min(1, progress)})`;
	root.toggleAttribute('data-hurry', timed() && run.started && left <= HURRY);
};

const tick = () => {
	if (timed() && run.elapsed() >= settings.seconds) return finish();
	drawStats();
	frame = requestAnimationFrame(tick);
};

const stopClock = () => {
	cancelAnimationFrame(frame);
	frame = 0;
};

// ---------- Rounds ----------

/** A new round: fresh text, or the same one again with `again`. */
const start = (again = false) => {
	stopClock();
	if (!again || !source.text) source = makeSource();
	run = createRun(source.text, settings.mode);
	over = false;
	scrolled = 0;
	caretLine = -1;
	spans = [];
	extraSpans.clear();
	inner.replaceChildren();
	if (settings.mode === 'words') drawWords(run.chars);
	else drawLines(run.chars);
	inner.append(caret);
	show(sourceLabel, source.label);
	show(sourceText, source.text);
	resultCard.hidden = true;
	clearField();
	drawStats();
	place();
	drawFocus();
};

const keyName = (key: string) => (key === ' ' ? t.keys.space : key === '\n' ? t.keys.enter : key);

const drawResult = (result: Result, previous: Best | undefined, fresh: boolean) => {
	const wpm = Math.round(result.wpm);
	const accuracy = Math.floor(result.accuracy * 100);
	show(scores.wpm, String(wpm));
	show(scores.raw, String(Math.round(result.raw)));
	show(scores.accuracy, `${accuracy}%`);
	show(scores.time, timed() ? `${settings.seconds}s` : `${result.seconds.toFixed(1)}s`);
	show(scores.chars, `${result.right}/${result.wrong}/${result.extra}/${result.skipped}`);

	if (fresh) {
		bestLine.replaceChildren(
			element('em', 'typing__new', t.result.newBest),
			...(previous ? [element('span', 'typing__was', `${t.result.was} ${previous.wpm}`)] : []),
		);
	} else {
		bestLine.replaceChildren(...(previous ? [element('span', 'typing__was', `${t.result.best} ${previous.wpm} wpm`)] : []));
	}
	bestLine.hidden = !bestLine.childElementCount;

	const missed = result.missed.slice(0, MISSED);
	missedKeys.replaceChildren(
		...(missed.length
			? missed.map(([key, count]) => {
					const item = element('span', 'typing__key');
					item.append(element('kbd', '', keyName(key)), element('span', '', `×${count}`));
					return item;
				})
			: [element('em', 'typing__clean', t.result.clean)]),
	);

	resultCard.hidden = false;
	show(announce, t.announce(wpm, accuracy));
};

const finish = () => {
	if (over) return;
	over = true;
	stopClock();
	run.stop();
	const result = run.result(timed() ? Math.min(settings.seconds, run.elapsed()) : run.elapsed());
	drawStats();

	const key = bestKey();
	const previous = bests[key];
	const wpm = Math.round(result.wpm);
	const fresh = result.right > 0 && (!previous || wpm > previous.wpm);
	if (fresh) {
		bests[key] = { wpm, accuracy: result.accuracy, at: new Date().toISOString() };
		write(BEST_KEY, bests);
		drawStats();
	}
	drawResult(result, previous, fresh);
	// The card takes the focus, not its buttons: keys still being typed when time runs out land on nothing,
	// where a space or enter would have pressed `next` and swept the result away. Tab reaches the buttons.
	resultCard.focus({ preventScroll: true });
	drawFocus();
};

nextButton.addEventListener('click', () => {
	start();
	input.focus();
});

retryButton.addEventListener('click', () => {
	start(true);
	input.focus();
});

restartButton.addEventListener('click', () => {
	start();
	input.focus();
});

// ---------- Keys ----------

/** The field's value as last typed, during a composition. */
let seen = '';
let composing = false;
/** Characters in the field that the run held or ignored, so deleting them doesn't erase typed ones. */
let phantoms = 0;
let restTimer = 0;
let flashTimer = 0;
let held: HTMLElement | undefined;

const clearField = () => {
	input.value = '';
	seen = '';
	phantoms = 0;
};

/** After a key: repaint what changed, move the caret, start the clock on the first key. */
const update = (before: number) => {
	const low = Math.min(before, run.pos);
	const high = Math.max(before, run.pos);
	paint(low - 1, high);
	// A word erased whole can take the extras of the boundary it crossed with it.
	for (const index of new Set([...extraSpans.keys(), ...run.extras.keys()])) {
		if (index >= low && index <= high) drawExtras(index);
	}
	place();
	if (run.started && !frame && !over) frame = requestAnimationFrame(tick);

	// The caret blinks only while the player rests.
	root.setAttribute('data-active', '');
	clearTimeout(restTimer);
	restTimer = setTimeout(() => root.removeAttribute('data-active'), 700);

	if (run.done) finish();
};

/** A held key flashes the position it's waiting at. */
const flash = () => {
	held?.removeAttribute('data-held');
	held = spans[run.pos];
	held?.setAttribute('data-held', '');
	clearTimeout(flashTimer);
	flashTimer = setTimeout(() => held?.removeAttribute('data-held'), 180);
};

const press = (char: string) => {
	if (over) return;
	const before = run.pos;
	const outcome = run.type(char);
	if ((outcome === 'held' || outcome === 'ignored') && composing) phantoms++;
	if (outcome === 'held') flash();
	update(before);
};

const back = (word = false) => {
	if (over) return;
	const before = run.pos;
	if (word) run.eraseWord();
	else run.erase();
	update(before);
};

/** Types whatever changed in the field since it was last seen. */
const sync = () => {
	const value = input.value;
	let common = 0;
	while (common < seen.length && common < value.length && seen[common] === value[common]) common++;
	for (let count = seen.length - common; count > 0; count--) {
		if (phantoms) phantoms--;
		else back();
	}
	for (const char of value.slice(common)) press(char === '\r' ? '\n' : char);
	seen = value;
	if (!composing) clearField();
};

input.addEventListener('input', sync);
input.addEventListener('compositionstart', () => (composing = true));
input.addEventListener('compositionend', () => {
	composing = false;
	// The last input of a composition can come after this event; let it land first.
	setTimeout(sync);
});

// The field is kept empty, so backspace changes nothing in it and is caught here instead.
input.addEventListener('keydown', (event) => {
	if (event.isComposing || event.key !== 'Backspace' || input.value) return;
	event.preventDefault();
	back(event.ctrlKey || event.altKey || event.metaKey);
});

// A click on a picker or restart leaves the focus in the text, so it doesn't blur for a moment in between.
root.addEventListener('mousedown', (event) => {
	if ((event.target as HTMLElement).closest('.typing__tab, .typing__lang, .typing__restart')) event.preventDefault();
});

input.addEventListener('paste', (event) => event.preventDefault());
input.addEventListener('drop', (event) => event.preventDefault());

addEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		if (!embedded) return;
		event.preventDefault();
		close();
		return;
	}
	// Typing anywhere else on the page goes to the text, unless it presses a button.
	if (over || event.target === input || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
	if (event.key === ' ' && event.target instanceof HTMLButtonElement) return;
	input.focus();
});

// ---------- Focus ----------

/** The text dims behind a hint whenever keys wouldn't reach it. */
const drawFocus = () => {
	show(focusHint, fine.matches ? t.focus : t.focusTouch);
	root.toggleAttribute('data-blurred', !over && !(document.hasFocus() && document.activeElement === input));
};

// Read once focus has settled; during a blur event it's still on its way.
const refocus = () => setTimeout(drawFocus);
input.addEventListener('focus', refocus);
input.addEventListener('blur', refocus);
addEventListener('focus', refocus);
addEventListener('blur', refocus);

// Embedded, the focus() at load is dropped: a cross-origin frame can't take the focus before the visitor has
// touched it. When the portfolio then focuses the frame and nothing inside has it, the text takes it, or the
// result card if a round has just ended.
addEventListener('focus', () => {
	if (!fine.matches || (document.activeElement && document.activeElement !== document.body)) return;
	if (over) resultCard.focus({ preventScroll: true });
	else input.focus({ preventScroll: true });
});

// Line breaks move when the box resizes or the fonts arrive.
new ResizeObserver(() => place()).observe(box);
document.fonts?.ready.then(() => place());

// ---------- Go ----------

drawPickers();
start();
// A keyboard can type right away; on a touch screen the keyboard only opens from a tap.
if (fine.matches) input.focus();
drawFocus();
ready();
