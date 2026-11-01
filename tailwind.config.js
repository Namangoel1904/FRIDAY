/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'cyber-cyan': '#00F0FF',
                'slate-grey': '#475569',
            },
            fontFamily: {
                'mono': ['Courier New', 'monospace'],
            },
        },
    },
    plugins: [],
}
