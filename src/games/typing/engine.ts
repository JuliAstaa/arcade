/*
 * The typing itself, kept apart from the page: one run over one text, what was
 * typed at each position, and the numbers at the end. main.ts draws it.
 *
 * Every key shows: mistakes stay on screen until backspace fixes them. Line
 * breaks, and in `words` the space between words, are boundaries: letters typed
 * where one is due are kept there as extras, so one slip can't push everything
 * after it out of line. In `words`, space in the middle of a word skips the rest
 * of it. In `code`, the indentation of each new line is typed for the player.
 */

export type Mode = 'words' | 'code' | 'shell';

/** A position not reached yet, typed right or wrong, jumped over by space, or indentation typed for the player. */
export type Mark = 'todo' | 'right' | 'wrong' | 'skipped' | 'auto';

/** What a key did: typed a position, added an extra at a boundary, was held, skipped a word's end, or was ignored. */
export type Outcome = 'right' | 'wrong' | 'extra' | 'held' | 'skipped' | 'ignored';

/** Extras kept at one boundary; keys past this are held. */
const MAX_EXTRAS = 10;

export interface Result {
	wpm: number;
	raw: number;
	/** Right keys over all keys pressed, mistakes fixed later included; 0 to 1. */
	accuracy: number;
	seconds: number;
	right: number;
	wrong: number;
	extra: number;
	skipped: number;
	/** The keys that should have been pressed when a mistake was made, most missed first. */
	missed: [key: string, count: number][];
}

export type Run = ReturnType<typeof createRun>;

const isSpace = (char: string | undefined) => char === ' ' || char === '\n';

export function createRun(text: string, mode: Mode) {
	const chars = [...text];
	const marks: Mark[] = chars.map(() => 'todo');
	// Leading spaces of each line, which `code` types for the player.
	const indent = chars.map((char, index) => {
		if (mode !== 'code' || char !== ' ') return false;
		let start = index;
		while (start > 0 && chars[start - 1] === ' ') start--;
		return start === 0 || chars[start - 1] === '\n';
	});
	const misses = new Map<string, number>();
	/** Keys typed where a space or line break was due, by that boundary's position. */
	const extras = new Map<number, string[]>();

	let pos = 0;
	let keys = 0;
	let hits = 0;
	let startedAt = 0;
	let endedAt = 0;

	const miss = (char: string) => misses.set(char, (misses.get(char) ?? 0) + 1);

	const skipIndent = () => {
		while (pos < chars.length && indent[pos]) marks[pos++] = 'auto';
	};

	const end = () => {
		if (pos >= chars.length && !endedAt) endedAt = performance.now();
	};

	/** At the first character of a line in `code`, past its indentation. */
	const atLineStart = () => pos === 0 || chars[pos - 1] === '\n' || marks[pos - 1] === 'auto';

	const type = (char: string): Outcome => {
		if (endedAt) return 'ignored';
		const expected = chars[pos];

		if (mode === 'words') {
			if (char === '\n') return 'ignored';
			if (char === ' ' && expected !== ' ') {
				// A space before the word has started is a double tap; after that, it moves on to the next word.
				if (pos === 0 || chars[pos - 1] === ' ') return 'ignored';
				if (!startedAt) startedAt = performance.now();
				while (pos < chars.length && chars[pos] !== ' ') marks[pos++] = 'skipped';
				keys++;
				hits++;
				if (pos < chars.length) marks[pos++] = 'right';
				end();
				return 'skipped';
			}
		}
		if (mode === 'code' && char === ' ' && expected !== ' ' && atLineStart()) return 'ignored';

		if (!startedAt) startedAt = performance.now();
		keys++;

		// Enter in the middle of a line would break it in two, so it waits.
		if (char === '\n' && expected !== '\n') {
			miss(expected);
			return 'held';
		}
		const boundary = expected === '\n' || (mode === 'words' && expected === ' ');
		if (boundary && char !== expected) {
			miss(expected);
			const list = extras.get(pos) ?? [];
			if (list.length >= MAX_EXTRAS) return 'held';
			list.push(char);
			extras.set(pos, list);
			return 'extra';
		}

		const right = char === expected;
		marks[pos++] = right ? 'right' : 'wrong';
		if (right) hits++;
		else miss(expected);
		skipIndent();
		end();
		return right ? 'right' : 'wrong';
	};

	/** Backspace: the last extra, or one position back, stepping over indentation and the rest of a skipped word in one go. */
	const erase = () => {
		if (endedAt) return;
		const list = extras.get(pos);
		if (list) {
			list.pop();
			if (!list.length) extras.delete(pos);
			return;
		}
		if (pos === 0) return;
		// Indentation was typed for the player, so it goes together with the line break before it.
		while (pos > 0 && marks[pos - 1] === 'auto') marks[--pos] = 'todo';
		if (pos > 0) marks[--pos] = 'todo';
		// A skipped word's end goes with the space that skipped it, back to where the player left the word.
		while (pos > 0 && marks[pos - 1] === 'skipped') marks[--pos] = 'todo';
		skipIndent();
	};

	/** Ctrl, Alt or Cmd with backspace: back to the start of the word, or of the one before at a word's start. */
	const eraseWord = () => {
		if (endedAt || (pos === 0 && !extras.has(pos))) return;
		erase();
		while (extras.has(pos) || (pos > 0 && !isSpace(chars[pos - 1]) && marks[pos - 1] !== 'auto')) erase();
	};

	const elapsed = () => (startedAt ? ((endedAt || performance.now()) - startedAt) / 1000 : 0);

	/** Ends a timed run when its time is up, wherever the cursor is. */
	const stop = () => {
		if (!endedAt) endedAt = performance.now();
	};

	/** The numbers so far; `seconds` caps the time for a timed run. */
	const result = (seconds = elapsed()): Result => {
		const count = (mark: Mark) => marks.filter((value) => value === mark).length;
		const right = count('right');
		const minutes = seconds / 60;
		return {
			wpm: minutes ? right / 5 / minutes : 0,
			raw: minutes ? keys / 5 / minutes : 0,
			accuracy: keys ? hits / keys : 1,
			seconds,
			right,
			wrong: count('wrong'),
			extra: [...extras.values()].reduce((sum, list) => sum + list.length, 0),
			skipped: count('skipped'),
			missed: [...misses].sort((a, b) => b[1] - a[1]),
		};
	};

	return {
		chars,
		marks,
		extras,
		type,
		erase,
		eraseWord,
		stop,
		elapsed,
		result,
		get pos() {
			return pos;
		},
		get started() {
			return startedAt > 0;
		},
		get done() {
			return endedAt > 0;
		},
	};
}
