/*
 * Pipeline's board, kept apart from the page: the pieces and how they turn,
 * a seeded generator whose every level can be solved, and the trace of the
 * line from PUSH that lights the pipes, decides a win and explains a near miss.
 * main.ts draws it.
 *
 * A level is carved backwards from its answer: a self-avoiding route from PUSH
 * to PROD with the stages placed along it in order, each route cell given the
 * piece its two openings need, decoys everywhere else, then every turnable tile
 * scrambled. The answer is always on the board, only turned away.
 */

export type Stage = 'build' | 'test' | 'deploy';
export type Kind = 'empty' | 'end' | 'straight' | 'corner' | 'tee' | 'cross' | 'push' | 'prod' | Stage;

export interface Tile {
	kind: Kind;
	/** Quarter turns clockwise from the piece as drawn; it keeps counting, so a turn always animates forward. */
	turns: number;
	/** PUSH, PROD and the stages: placed by the level, never turned. */
	fixed: boolean;
	/** A pipe that can't be turned, from level 4. */
	locked: boolean;
}

export interface Board {
	size: number;
	tiles: Tile[];
	push: number;
	prod: number;
	/** The stages the line has to pass, in order. */
	stages: Stage[];
	/** The answer's route from PUSH to PROD, as tile indices. */
	route: number[];
}

export interface Level {
	number: number;
	size: number;
	stages: Stage[];
	/** The CI budget, in seconds. */
	seconds: number;
	/** Pipes on the route, and decoys, that can't be turned. */
	locked: { route: number; decoys: number };
	/** Fewer empty cells and more tees and crosses among the decoys. */
	crowded: boolean;
}

export type Hint = { type: 'missing'; stage: Stage } | { type: 'order'; early: Stage; late: Stage } | { type: 'through' };

export interface Trace {
	/** Tiles joined to PUSH. */
	lit: Set<number>;
	won: boolean;
	/** The winning line, PUSH to PROD, tile by tile. */
	path: number[];
	/** Why a line that reaches PROD doesn't count. */
	hint?: Hint;
}

export const STAGES: Stage[] = ['build', 'test', 'deploy'];

/** Openings of each piece as drawn, a bit per direction clockwise from the top: N 1, E 2, S 4, W 8. */
export const SHAPES: Record<Kind, number> = {
	empty: 0,
	end: 1,
	straight: 5,
	corner: 3,
	tee: 7,
	cross: 15,
	push: 1,
	prod: 1,
	build: 5,
	test: 5,
	deploy: 5,
};

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const bit = (dir: number) => 1 << dir;
const opposite = (dir: number) => (dir + 2) % 4;

export const isStage = (kind: Kind): kind is Stage => (STAGES as Kind[]).includes(kind);

/** `mask` turned clockwise by `turns` quarter turns. */
export const turn = (mask: number, turns: number) => {
	let result = mask;
	for (let step = 0; step < ((turns % 4) + 4) % 4; step++) result = ((result << 1) | (result >> 3)) & 15;
	return result;
};

export const openings = (tile: Tile) => turn(SHAPES[tile.kind], tile.turns);
export const canTurn = (tile: Tile) => !tile.fixed && !tile.locked && tile.kind !== 'empty';

/** The levels of a run: bigger boards, more stages and less time as it goes. */
export const level = (number: number): Level => ({
	number,
	size: number === 1 ? 4 : number <= 3 ? 5 : number <= 5 ? 6 : 7,
	stages: STAGES.slice(0, Math.min(number, STAGES.length)),
	seconds: Math.max(30, 60 - 3 * (number - 1)),
	locked: number >= 6 ? { route: 2, decoys: 3 } : number >= 4 ? { route: 1, decoys: 2 } : { route: 0, decoys: 0 },
	crowded: number >= 4,
});

/** mulberry32: a small seeded generator of numbers from 0 to 1. */
export const random = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** Decoy pieces by weight, as `[kind, weight]`. */
const DECOYS: Record<'calm' | 'crowded', [Kind, number][]> = {
	calm: [
		['empty', 20],
		['end', 20],
		['straight', 20],
		['corner', 25],
		['tee', 10],
		['cross', 5],
	],
	crowded: [
		['empty', 8],
		['end', 17],
		['straight', 20],
		['corner', 25],
		['tee', 18],
		['cross', 12],
	],
};

/** The board of level `spec` in the run seeded `run`; the same pair always makes the same board. */
export function generate(spec: Level, run: number): Board {
	const rand = random(Math.imul(run + 1, 0x9e3779b1) ^ Math.imul(spec.number, 0x85ebca6b));
	const { size, stages } = spec;
	const at = (x: number, y: number) => y * size + x;
	const shuffle = <T>(items: T[]) => {
		for (let i = items.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[items[i], items[j]] = [items[j], items[i]];
		}
		return items;
	};
	const direction = (from: number, to: number) => {
		const dx = (to % size) - (from % size);
		const dy = Math.floor(to / size) - Math.floor(from / size);
		return DX.findIndex((x, dir) => x === dx && DY[dir] === dy);
	};

	// Long enough to leave room for the stages, short enough to leave room for decoys.
	const shortest = Math.max(3 * stages.length + 3, Math.round(size * 1.6));
	const longest = Math.max(shortest + 2, Math.round(size * size * 0.55));

	/** A self-avoiding route from the left edge to the right one, or nothing if this try got lost. */
	const carve = () => {
		const start = at(0, Math.floor(rand() * size));
		const goal = at(size - 1, Math.floor(rand() * size));
		const route = [start];
		const used = new Set(route);
		let budget = 4000;
		const step = (cell: number, heading: number): boolean => {
			if (--budget < 0) return false;
			if (cell === goal) return route.length >= shortest;
			if (route.length >= longest) return false;
			// Half the time it tries to carry on straight, so the route has straight runs for the stages.
			const dirs = shuffle([0, 1, 2, 3]);
			if (heading >= 0 && rand() < 0.5) dirs.unshift(...dirs.splice(dirs.indexOf(heading), 1));
			for (const dir of dirs) {
				const x = (cell % size) + DX[dir];
				const y = Math.floor(cell / size) + DY[dir];
				if (x < 0 || y < 0 || x >= size || y >= size) continue;
				const next = at(x, y);
				if (used.has(next)) continue;
				route.push(next);
				used.add(next);
				if (step(next, dir)) return true;
				route.pop();
				used.delete(next);
			}
			return false;
		};
		return step(start, -1) ? route : undefined;
	};

	/** Where the stages sit: on straight runs, in order, spread along the route, never side by side. */
	const placeStages = (route: number[]) => {
		const straight = [...route.keys()]
			.filter((index) => index >= 2 && index <= route.length - 3)
			.filter((index) => direction(route[index - 1], route[index]) === direction(route[index], route[index + 1]));
		const places: number[] = [];
		for (let index = 0; index < stages.length; index++) {
			const target = Math.round(((index + 1) * (route.length - 1)) / (stages.length + 1));
			const after = places.at(-1) ?? 0;
			const options = straight.filter(
				(place) => place >= after + 2 && straight.filter((later) => later >= place + 2).length >= stages.length - index - 1,
			);
			if (!options.length) return undefined;
			places.push(options.reduce((best, place) => (Math.abs(place - target) < Math.abs(best - target) ? place : best)));
		}
		return places;
	};

	for (let attempt = 0; attempt < 500; attempt++) {
		const route = carve();
		const places = route && placeStages(route);
		if (!route || !places) continue;

		const tiles: Tile[] = [];
		// The answer: each route cell gets the piece its two openings need, turned to fit.
		route.forEach((cell, index) => {
			const into = index > 0 ? bit(opposite(direction(route[index - 1], cell))) : 0;
			const out = index < route.length - 1 ? bit(direction(cell, route[index + 1])) : 0;
			const mask = into | out;
			const stage = places.indexOf(index);
			const kind: Kind =
				index === 0 ? 'push' : index === route.length - 1 ? 'prod' : stage >= 0 ? stages[stage] : mask === 5 || mask === 10 ? 'straight' : 'corner';
			const turns = [0, 1, 2, 3].find((turns) => turn(SHAPES[kind], turns) === mask)!;
			tiles[cell] = { kind, turns, fixed: kind !== 'straight' && kind !== 'corner', locked: false };
		});

		// Decoys everywhere else: dead ends, tees that branch away, crosses, some gaps.
		const weights = DECOYS[spec.crowded ? 'crowded' : 'calm'];
		const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
		for (let cell = 0; cell < size * size; cell++) {
			if (tiles[cell]) continue;
			let roll = rand() * total;
			const kind = weights.find(([, weight]) => (roll -= weight) < 0)?.[0] ?? 'empty';
			tiles[cell] = { kind, turns: Math.floor(rand() * 4), fixed: false, locked: false };
		}

		// From level 4 a few pipes are locked: some on the route, in place, and some decoys, wherever they point.
		const pipes = shuffle(route.filter((cell) => !tiles[cell].fixed));
		for (const cell of pipes.slice(0, spec.locked.route)) tiles[cell].locked = true;
		const decoys = shuffle([...tiles.keys()].filter((cell) => !route.includes(cell) && tiles[cell].kind !== 'empty'));
		for (const cell of decoys.slice(0, spec.locked.decoys)) tiles[cell].locked = true;

		const board: Board = { size, tiles, push: route[0], prod: route.at(-1)!, stages: [...stages], route };
		// Scrambled until it doesn't start out solved.
		for (let tries = 0; tries < 50; tries++) {
			for (const tile of tiles) if (canTurn(tile)) tile.turns = Math.floor(rand() * 4);
			if (!trace(board).won) return board;
		}
	}
	throw new Error(`No board for level ${spec.number} of run ${run}`);
}

/** The tile next to `cell` in `dir`, if its openings meet this one's; otherwise -1. */
const joined = (board: Board, cell: number, dir: number) => {
	const x = (cell % board.size) + DX[dir];
	const y = Math.floor(cell / board.size) + DY[dir];
	if (x < 0 || y < 0 || x >= board.size || y >= board.size) return -1;
	const next = y * board.size + x;
	const meets = openings(board.tiles[cell]) & bit(dir) && openings(board.tiles[next]) & bit(opposite(dir));
	return meets ? next : -1;
};

/**
 * Follows the line from `cell` heading `dir` to the next tile that isn't a stage, passing each stage on the
 * way straight through, in one side and out the other. `through` lists the stages passed.
 */
const run = (board: Board, cell: number, dir: number) => {
	const through: number[] = [];
	let heading = dir;
	let next = joined(board, cell, dir);
	while (next >= 0) {
		if (!isStage(board.tiles[next].kind)) break;
		through.push(next);
		const rest = openings(board.tiles[next]) & ~bit(opposite(heading));
		heading = [0, 1, 2, 3].find((d) => rest & bit(d)) ?? -1;
		next = heading < 0 ? -1 : joined(board, next, heading);
	}
	return { next, through };
};

/** What the line from PUSH does right now: which tiles it reaches, and whether it ships. */
export function trace(board: Board): Trace {
	const { tiles, push, prod, stages } = board;

	const lit = new Set([push]);
	const queue = [push];
	while (queue.length) {
		const cell = queue.shift()!;
		for (let dir = 0; dir < 4; dir++) {
			const next = joined(board, cell, dir);
			if (next >= 0 && !lit.has(next)) {
				lit.add(next);
				queue.push(next);
			}
		}
	}

	// The win: a walk from PUSH to PROD that passes each stage in its turn. A state is a tile and how many
	// stages are behind the line when it gets there.
	type Step = { cell: number; passed: number };
	const key = ({ cell, passed }: Step) => `${cell}:${passed}`;
	const from = new Map<string, { step: Step; through: number[] }>();
	const steps: Step[] = [{ cell: push, passed: 0 }];
	const seen = new Set([key(steps[0])]);
	while (steps.length) {
		const step = steps.shift()!;
		for (let dir = 0; dir < 4; dir++) {
			const { next, through } = run(board, step.cell, dir);
			if (next < 0 || next === push) continue;
			// A stage out of its turn stops the line there.
			if (through.some((stage, index) => tiles[stage].kind !== stages[step.passed + index])) continue;
			const passed = step.passed + through.length;
			if (next === prod) {
				if (passed < stages.length) continue;
				// Back from PROD to PUSH, tunnels included.
				const path = [prod, ...through.toReversed()];
				let at: Step | undefined = step;
				while (at) {
					path.push(at.cell);
					const link = from.get(key(at));
					path.push(...(link?.through.toReversed() ?? []));
					at = link?.step;
				}
				return { lit, won: true, path: path.reverse() };
			}
			const reached = { cell: next, passed };
			if (seen.has(key(reached))) continue;
			seen.add(key(reached));
			from.set(key(reached), { step, through });
			steps.push(reached);
		}
	}

	if (!lit.has(prod)) return { lit, won: false, path: [] };

	// It reaches PROD, just not the right way: the shortest such line says what went wrong.
	const before = new Map<number, { cell: number; through: number[] }>([[push, { cell: -1, through: [] }]]);
	const cells = [push];
	while (cells.length && !before.has(prod)) {
		const cell = cells.shift()!;
		for (let dir = 0; dir < 4; dir++) {
			const { next, through } = run(board, cell, dir);
			if (next < 0 || before.has(next)) continue;
			before.set(next, { cell, through });
			cells.push(next);
		}
	}
	const passed: Stage[] = [];
	for (let cell = prod; cell !== push && before.has(cell); cell = before.get(cell)!.cell) {
		passed.unshift(...before.get(cell)!.through.map((stage) => tiles[stage].kind as Stage));
	}
	let due = 0;
	for (const stage of passed) {
		if (stage !== stages[due]) return { lit, won: false, path: [], hint: { type: 'order', early: stage, late: stages[due] } };
		due++;
	}
	const hint: Hint = due < stages.length ? { type: 'missing', stage: stages[due] } : { type: 'through' };
	return { lit, won: false, path: [], hint };
}
