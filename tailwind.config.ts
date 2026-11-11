import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1D4ED8',
          dark: '#1E40AF',
          deep: '#1E3A8A',
          light: '#EFF6FF',
          surface: '#F0F6FF',
          muted: '#DBEAFE',
          accent: '#FACC15',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem',   // 20px
        panel: '1.5rem',   // 24px
        pill: '9999px',
        btn: '1rem',       // 16px
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(29, 78, 216, 0.08)',
        floating: '0 10px 30px -4px rgba(29, 78, 216, 0.28)',
      },
    },
  },
  plugins: [],
};

export default config;
