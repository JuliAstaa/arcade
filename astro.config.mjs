// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// Only these pages may frame a game: the portfolio, its bare domain, and its dev server.
// Keep in sync with vercel.json and public/_headers.
const frameAncestors = "frame-ancestors 'self' https://www.juliasta.my.id https://juliasta.my.id http://localhost:4321";

export default defineConfig({
	site: 'https://arcade.juliasta.my.id',
	server: {
		// The portfolio's dev server has 4321.
		port: 4322,
		headers: { 'Content-Security-Policy': frameAncestors },
	},
	// The toolbar would sit inside the portfolio's popup when a game is embedded in dev.
	devToolbar: { enabled: false },
	// The same fonts as the portfolio, self-hosted at build time.
	fonts: [
		{
			provider: fontProviders.google(),
			name: 'Jost',
			cssVariable: '--font-display',
			weights: ['500 800'],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['Futura', 'Avenir Next', 'sans-serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'Instrument Serif',
			cssVariable: '--font-serif',
			weights: [400],
			styles: ['italic'],
			subsets: ['latin'],
			fallbacks: ['Georgia', 'serif'],
		},
		{
			provider: fontProviders.google(),
			name: 'JetBrains Mono',
			cssVariable: '--font-mono',
			weights: [400, 500],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
		},
		{
			provider: fontProviders.google(),
			name: 'Inter',
			cssVariable: '--font-sans',
			weights: ['400 600'],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
		},
	],
});
