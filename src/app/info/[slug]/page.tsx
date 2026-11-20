import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { listPublicPoints } from '@/core/points/service';

const WEEKDAY_NAMES = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

const INFO_PAGES: Record<
  string,
  { title: string; subtitle: string; paragraphs: string[] }
> = {
  contacts: {
    title: 'Контакты',
    subtitle: 'Связь с сетью кофеен и станций «СТАНЦИЯ» в г. Миасс',
    paragraphs: [
      'Сеть точек предзаказа кофе и городских сервисов «СТАНЦИЯ» (г. Миасс, Челябинская область).',
      'По вопросам качества обслуживания, забытых вещей или восстановления пароля обращайтесь непосредственно на удобную точку или по телефонам точек.',
      'Примечание: точные реквизиты и юридический текст предоставит заказчик.',
    ],
  },
  points: {
    title: 'Адреса точек и часы работы',
    subtitle: 'Точки самовывоза «СТАНЦИЯ» в г. Миасс',
    paragraphs: [
      'Все заказы оформляются на текущий день с самовывозом на выбранной станции. Время указано по местному времени г. Миасс (UTC+5).',
    ],
  },
  pickup: {
    title: 'Условия самовывоза и оплаты',
    subtitle: 'Как работает предзаказ без ожидания',
    paragraphs: [
      '1. Выберите напитки и еду в каталоге, укажите точку самовывоза и удобное время получения сегодня.',
      '2. Оплата производится на точке при получении заказа (наличными или банковской картой на кассе). Онлайн-оплата на сайте не требуется.',
      '3. Отменить заказ самостоятельно можно на странице заказа, пока он находится в статусе «Новый». После принятия заказа в работу для отмены свяжитесь с точкой по телефону.',
      'Примечание: полный текст правил самовывоза предоставит заказчик.',
    ],
  },
  privacy: {
    title: 'Политика конфиденциальности',
    subtitle: 'Положение об обработке и защите персональных данных',
    paragraphs: [
      'Настоящая Политика конфиденциальности регулирует порядок обработки имени и номера телефона гостей и зарегистрированных клиентов сервиса предзаказа «СТАНЦИЯ».',
      'Персональные данные используются исключительно для исполнения предзаказа, идентификации гостя при выдаче заказа на точке и отображения истории заказов в личном кабинете.',
      'Примечание: финальный юридический текст политики конфиденциальности предоставит заказчик.',
    ],
  },
  consent: {
    title: 'Согласие на обработку персональных данных',
    subtitle: 'Условия согласия пользователя при оформлении предзаказа и регистрации',
    paragraphs: [
      'Отмечая флажок согласия при оформлении заказа или регистрации на сайте «СТАНЦИЯ», пользователь даёт согласие на обработку своих персональных данных (имя, номер телефона).',
      'Цель обработки — подготовка и выдача предзаказа на выбранной точке сети «СТАНЦИЯ» в г. Миасс.',
      'Примечание: финальный юридический текст согласия предоставит заказчик.',
    ],
  },
};

export default async function InfoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pageData = INFO_PAGES[slug];
  if (!pageData) {
    notFound();
  }

  const points = slug === 'points' || slug === 'contacts' ? await listPublicPoints('coffee') : [];

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="dark" subtitle="Информация" />
          <Link
            href="/"
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand text-xs sm:text-sm font-bold transition"
          >
            ← В каталог
          </Link>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto px-4 py-8 space-y-6 flex-1">
        <div className="bg-white rounded-panel p-6 sm:p-8 shadow-card border border-blue-50 space-y-4">
          <div className="inline-block px-3 py-1 rounded-pill bg-amber-100 text-amber-900 text-xs font-bold">
            Информационный раздел (текст предоставит заказчик)
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{pageData.title}</h1>
          <p className="text-sm font-semibold text-slate-500">{pageData.subtitle}</p>
          <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
            {pageData.paragraphs.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>

          {points.length > 0 && (
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {points.map((pt) => (
                <div
                  key={pt.id}
                  className="p-4 rounded-card bg-brand-surface border border-blue-100 space-y-2"
                >
                  <div className="font-extrabold text-slate-900">{pt.name}</div>
                  <div className="text-xs text-slate-600">{pt.address}</div>
                  <div className="text-xs font-bold text-brand">Телефон: {pt.phone}</div>
                  <div className="text-xs text-slate-600 pt-1 space-y-0.5">
                    <div className="font-bold text-slate-700">Часы работы:</div>
                    {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                      const h = pt.hours.find((item) => item.weekday === wd);
                      return (
                        <div key={wd} className="flex justify-between">
                          <span>{WEEKDAY_NAMES[wd]}:</span>
                          <span className="font-semibold">
                            {h?.isClosed
                              ? 'Выходной'
                              : `${h?.opensAt ?? '08:00'} – ${h?.closesAt ?? '21:00'}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
