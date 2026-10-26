import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			'/api/apuracao': {
				target: 'https://djwnrcncpvp8z.cloudfront.net',
				changeOrigin: true,
				rewrite: () => '/oficial/2026/2t/historical/br/presidente.json',
				proxyTimeout: 15000,
			},
		},
	},
})