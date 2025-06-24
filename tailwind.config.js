/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vite-blue': '#747bff',
        'solid-blue': '#2f5d90',
        'tauri-cyan': '#24c8db',
        'link-blue': '#646cff',
        'link-hover': '#535bf2',
        'text-light': '#0f0f0f',
        'text-dark': '#f6f6f6',
        'bg-light': '#f6f6f6',
        'bg-dark': '#2f2f2f',
        'button-hover': '#396cd8',
        'button-active-light': '#e8e8e8',
        'button-active-dark': '#0f0f0f69',
        'button-bg-dark': '#0f0f0f98',
      },
      fontFamily: {
        'sans': ['Inter', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'base': '16px',
      },
      lineHeight: {
        'base': '24px',
      },
      fontWeight: {
        'normal': '400',
        'medium': '500',
      },
      spacing: {
        '18': '4.5rem', // 72px, close to 6em
        '22': '5.5rem', // 88px, closest to 90px (6em ≈ 96px)
      },
      dropShadow: {
        'vite': '0 0 2em #747bff',
        'solid': '0 0 2em #2f5d90',
        'tauri': '0 0 2em #24c8db',
      },
      transitionDuration: {
        '750': '0.75s',
      },
    },
  },
  plugins: [],
}