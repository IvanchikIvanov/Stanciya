import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import '@/modules';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'СТАНЦИЯ — Кофе по пути (г. Миасс)',
  description: 'Предзаказ кофе и напитков с самовывозом на точках сети «СТАНЦИЯ» в г. Миасс',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="min-h-screen bg-brand-surface text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
