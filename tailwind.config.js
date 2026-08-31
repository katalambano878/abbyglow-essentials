/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./{app,components,libs,pages,hooks}/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Outfit', 'sans-serif'],
        serif: ['Inter', 'Outfit', 'sans-serif'],
        handwriting: ['Pacifico', 'cursive'],
      },
      colors: {
        brand: {
          DEFAULT: '#0A0A0A',
          green: '#0A0A0A',
          navy: '#0A0A0A',
          dark: '#000000',
          soft: '#F4F4F4',
          accent: '#C8F542',
          accentDark: '#B4E02A',
          cta: '#C8F542',
          ink: '#0A0A0A',
          muted: '#6B6B6B',
          surface: '#FFFFFF',
          line: '#E5E5E5',
        },
      },
    },
  },
  plugins: [],
};
