import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Фирменный электрический синий (экранное приближение по макету лендинга;
        // официальный код цвета у заказчика не запрошен)
        brand: {
          DEFAULT: '#1747E6',
          dark: '#1036BD',
          deep: '#0B2A8F',
          light: '#EEF2FF',
          surface: '#F6F4F0',
          muted: '#DCE4FF',
          accent: '#FACC15',
          ink: '#0E1530',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem',   // 20px
        panel: '1.5rem',   // 24px
        pill: '9999px',
        btn: '1rem',       // 16px
      },
      boxShadow: {
        card: '0 1px 2px rgba(14, 21, 48, 0.04), 0 6px 20px -8px rgba(14, 21, 48, 0.10)',
        floating: '0 10px 30px -4px rgba(23, 71, 230, 0.32)',
      },
    },
  },
  plugins: [],
};

export default config;
