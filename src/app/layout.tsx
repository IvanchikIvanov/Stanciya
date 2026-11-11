import type { Metadata } from 'next';
import './globals.css';
import '@/modules';

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
    <html lang="ru">
      <body className="min-h-screen bg-brand-surface text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
