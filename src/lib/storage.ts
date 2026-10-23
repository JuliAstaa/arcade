/*
 * localStorage, per origin, can be missing or throw: private windows, blocked
 * site data, sandboxed frames. A game never depends on it, so every read falls
 * back and every write is allowed to fail quietly.
 */

export const read = <T>(key: string): T | undefined => {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? undefined : (JSON.parse(raw) as T);
	} catch {
		return undefined;
	}
};

export const write = (key: string, value: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {}
};
