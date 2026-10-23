import type { Lang } from '../../lib/embed';
import type { Kind, Stage } from './board';

const en = {
	title: 'Pipeline',
	tagline: 'Turn the pipes to ship a commit from PUSH to PROD before CI times out.',
	rules: [
		{ key: 'goal', text: 'Run one line from PUSH to PROD.' },
		{ key: 'order', text: 'It has to pass every stage, in order: BUILD, then TEST, then DEPLOY.' },
		{ key: 'clock', text: 'Each level has a CI budget. What’s left of it adds to your score.' },
		{ key: 'keys', text: 'Click or tap a pipe to turn it; Shift+click or right-click turns it back. Arrows and Space work too, and R restarts the level.' },
	],
	start: 'start run',
	stats: { level: 'level', time: 'ci time', moves: 'moves', best: 'best' },
	run: (seed: string) => `run #${seed}`,
	grid: (size: number) => `${size}×${size}`,
	log: {
		start: 'waiting for a line to prod',
		restart: 'level restarted',
		passed: (stage: string) => `✓ ${stage}`,
		shipped: 'shipped to prod',
		timeout: 'build timed out',
	},
	hints: {
		missing: { build: 'nothing got built', test: 'no tests? not shipping that', deploy: 'it never got deployed' } as Record<Stage, string>,
		order: (early: string, late: string) => `${early} ran before ${late}`,
		through: 'the line has to run through every stage',
	},
	over: {
		title: 'build timed out',
		cleared: 'levels cleared',
		score: 'score',
		best: 'best',
		newBest: 'new personal best',
		level: (number: number) => `level ${number}`,
		again: 'run again',
	},
	keys: { click: 'click', space: 'space', turn: 'turn', back: 'back', move: 'move', restart: 'restart level', close: 'close' },
	restart: 'restart level',
	board: 'Board',
	pieces: {
		empty: 'empty',
		end: 'dead end',
		straight: 'straight pipe',
		corner: 'corner pipe',
		tee: 'tee pipe',
		cross: 'cross pipe',
		push: 'PUSH',
		prod: 'PROD',
		build: 'BUILD',
		test: 'TEST',
		deploy: 'DEPLOY',
	} as Record<Kind, string>,
	tile: (row: number, column: number, piece: string, states: string[]) =>
		`Row ${row}, column ${column}: ${piece}${states.map((state) => `, ${state}`).join('')}`,
	states: { locked: 'locked', lit: 'connected' },
	announce: {
		cleared: (number: number) => `Level ${number} cleared.`,
		over: (levels: number, score: number) => `Build timed out. ${levels} levels cleared, score ${score}.`,
	},
};

export type Text = typeof en;

const id: Text = {
	title: 'Pipeline',
	tagline: 'Putar pipanya biar commit sampai dari PUSH ke PROD sebelum CI kehabisan waktu.',
	rules: [
		{ key: 'tujuan', text: 'Sambungkan satu jalur dari PUSH ke PROD.' },
		{ key: 'urutan', text: 'Jalurnya harus lewat semua stage secara berurutan: BUILD, lalu TEST, lalu DEPLOY.' },
		{ key: 'waktu', text: 'Tiap level punya jatah waktu CI. Sisanya ditambahkan ke skor.' },
		{ key: 'tombol', text: 'Klik atau ketuk pipa untuk memutarnya; Shift+klik atau klik kanan memutar balik. Panah dan Spasi juga bisa, dan R mengulang level.' },
	],
	start: 'mulai',
	stats: { level: 'level', time: 'waktu ci', moves: 'langkah', best: 'rekor' },
	run: (seed) => `run #${seed}`,
	grid: (size) => `${size}×${size}`,
	log: {
		start: 'menunggu jalur ke prod',
		restart: 'level diulang',
		passed: (stage) => `✓ ${stage}`,
		shipped: 'rilis ke prod',
		timeout: 'build kehabisan waktu',
	},
	hints: {
		missing: { build: 'belum ada yang di-build', test: 'tanpa tes? gak jadi rilis', deploy: 'belum di-deploy' },
		order: (early, late) => `${early} jalan sebelum ${late}`,
		through: 'jalurnya harus lewat semua stage',
	},
	over: {
		title: 'build kehabisan waktu',
		cleared: 'level selesai',
		score: 'skor',
		best: 'rekor',
		newBest: 'rekor pribadi baru',
		level: (number) => `level ${number}`,
		again: 'main lagi',
	},
	keys: { click: 'klik', space: 'spasi', turn: 'putar', back: 'balik', move: 'pindah', restart: 'ulang level', close: 'tutup' },
	restart: 'ulang level',
	board: 'Papan',
	pieces: {
		empty: 'kosong',
		end: 'pipa buntu',
		straight: 'pipa lurus',
		corner: 'pipa belok',
		tee: 'pipa cabang tiga',
		cross: 'pipa silang',
		push: 'PUSH',
		prod: 'PROD',
		build: 'BUILD',
		test: 'TEST',
		deploy: 'DEPLOY',
	},
	tile: (row, column, piece, states) => `Baris ${row}, kolom ${column}: ${piece}${states.map((state) => `, ${state}`).join('')}`,
	states: { locked: 'terkunci', lit: 'tersambung' },
	announce: {
		cleared: (number) => `Level ${number} selesai.`,
		over: (levels, score) => `Build kehabisan waktu. ${levels} level selesai, skor ${score}.`,
	},
};

export const texts: Record<Lang, Text> = { en, id };
