/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: {
          DEFAULT: '#F6F2E8',
          deep: '#EFE9DA',
        },
        parchment: '#FCFAF4',
        forest: {
          50: '#EEF4F0',
          100: '#DCE8E1',
          200: '#B9D1C4',
          300: '#8FB4A0',
          400: '#5F917A',
          500: '#3F735C',
          600: '#2C5D48',
          700: '#1F4A39',
          800: '#173A2D',
          900: '#123026',
          950: '#0A2019',
        },
        gold: {
          50: '#FBF7EC',
          100: '#F5EBCF',
          200: '#EAD6A0',
          300: '#DEBD6C',
          400: '#D2A44B',
          500: '#B8893B',
          600: '#9A6D2F',
          700: '#7C5427',
          800: '#654525',
          900: '#543A22',
        },
        ink: '#1B2621',
        muted: '#66706A',
        line: '#E4DDCC',
        danger: '#9B3A32',
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27, 38, 33, 0.04), 0 8px 24px -12px rgba(27, 38, 33, 0.14)',
        lift: '0 18px 50px -22px rgba(18, 48, 38, 0.38)',
        book: '0 10px 22px -8px rgba(27, 38, 33, 0.35)',
      },
      borderRadius: {
        xl2: '1.1rem',
      },
      maxWidth: {
        page: '76rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
