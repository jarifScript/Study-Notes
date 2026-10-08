/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans Variable', 'Hind Siliguri', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
