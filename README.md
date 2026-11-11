# Веб-платформа предзаказа «СТАНЦИЯ» (г. Миасс)

Единая веб-платформа предзаказа кофе и напитков с самовывозом для сети точек «СТАНЦИЯ» (г. Миасс, часовой пояс `Asia/Yekaterinburg`, UTC+5).

Включает три интерфейса на одном сервере и одной базе данных:
1. **Витрина гостя** (`/`, `/cart`, `/checkout`, `/order/[accessKey]`, `/login`, `/register`, `/profile`, `/info/*`)
2. **Панель бариста** (`/staff/login`, `/barista`)
3. **Админ-панель** (`/admin/catalog`, `/admin/modifiers`, `/admin/points`, `/admin/staff`, `/admin/orders`, `/admin/stats`)

---

## 1. Быстрый старт локально (режим разработки на PGlite)

Установка локального сервера PostgreSQL или Docker **не требуется** — при пустом `DATABASE_URL` автоматически используется встроенный PostgreSQL-движок `@electric-sql/pglite` с хранением данных в папке `./.pglite`.

```powershell
# 1. Скопировать пример переменных окружения
Copy-Item .env.example .env

# 2. Установить зависимости
npm install

# 3. Применить SQL-миграции (ядро + модуль кофе)
npm run migrate

# 4. Заполнить базу начальными данными (точки в Миассе, меню, модификаторы, сотрудники)
npm run seed

# 5. Запустить сервер разработки
npm run dev
```

После запуска приложение доступно по адресу `http://localhost:3000`:
- Витрина гостя: `http://localhost:3000/`
- Служебный вход (бариста и администратор): `http://localhost:3000/staff/login`
- Панель бариста: `http://localhost:3000/barista`
- Админ-панель: `http://localhost:3000/admin`

Запуск автотестов бизнес-правил и сквозных сценариев приёмки:
```powershell
npm test
```

Проверка продакшен-сборки:
```powershell
npm run build
```

---

## 2. Переменные окружения (`.env`)

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `DATABASE_URL` | Строка подключения PostgreSQL (`postgres://...` или `postgresql://...`). Если пусто — локальный PGlite (`./.pglite`) | пусто (PGlite) |
| `UPLOAD_DIR` | Каталог на диске для хранения загруженных фотографий товаров | `./uploads` |
| `MAX_ACTIVE_ORDERS_PER_PHONE` | Лимит активных заказов на один номер телефона (`0` — отключить лимит) | `2` |
| `ENABLE_NO_SHOW_COUNTER` | Показывать ли сотрудникам счётчик «Не забрал заказов: N» (`true` / `false`) | `true` |
| `SEED_ADMIN_LOGIN` | Логин администратора при выполнении `npm run seed` | задаётся в `.env` |
| `SEED_ADMIN_PASSWORD` | Пароль администратора при выполнении `npm run seed` | задаётся в `.env` |
| `SEED_BARISTA1_LOGIN` | Логин бариста первой точки при выполнении `npm run seed` | задаётся в `.env` |
| `SEED_BARISTA1_PASSWORD` | Пароль бариста первой точки | задаётся в `.env` |
| `SEED_BARISTA2_LOGIN` | Логин бариста второй точки при выполнении `npm run seed` | задаётся в `.env` |
| `SEED_BARISTA2_PASSWORD` | Пароль бариста второй точки | задаётся в `.env` |

---

## 3. Развёртывание на боевом сервере (PostgreSQL + HTTPS)

### 3.1. Подготовка PostgreSQL 15+
Создайте пользователя и базу данных на сервере PostgreSQL:
```sql
CREATE USER stanciya_user WITH PASSWORD 'STRONG_DB_PASSWORD';
CREATE DATABASE stanciya_prod OWNER stanciya_user;
```

### 3.2. Настройка и сборка приложения
1. Заполните `.env` на сервере:
   ```env
   NODE_ENV=production
   DATABASE_URL=postgresql://stanciya_user:STRONG_DB_PASSWORD@127.0.0.1:5432/stanciya_prod
   UPLOAD_DIR=/var/lib/stanciya/uploads
   MAX_ACTIVE_ORDERS_PER_PHONE=2
   ENABLE_NO_SHOW_COUNTER=true
   ```
2. Выполните установку, миграции, сиды и сборку:
   ```bash
   npm ci
   npm run migrate
   npm run seed
   npm run build
   ```
3. Запустите приложение под управлением `systemd` или `pm2`:
   ```bash
   npm run start -- -p 3000
   ```

### 3.3. Настройка HTTPS (Nginx + Let's Encrypt)
В продакшене cookie сессии передаются с флагом `Secure`, поэтому обязательно проксируйте трафик через Nginx/Caddy с HTTPS:
```nginx
server {
    listen 443 ssl http2;
    server_name stanciya-miass.ru;

    client_max_body_size 6M;

    ssl_certificate     /etc/letsencrypt/live/stanciya-miass.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stanciya-miass.ru/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4. Резервное копирование базы данных и загрузок

### 4.1. Боевой PostgreSQL
Ежедневный дамп базы данных через `pg_dump` (например, по `cron`):
```bash
pg_dump --format=custom --file="/var/backups/stanciya/db_$(date +%F_%H%M).dump" "$DATABASE_URL"
```
Восстановление из дампа:
```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" /var/backups/stanciya/db_YYYY-MM-DD_HHMM.dump
```

Также включите каталог изображений `UPLOAD_DIR` (`/var/lib/stanciya/uploads`) в ежедневный архив резервного копирования:
```bash
tar -czf "/var/backups/stanciya/uploads_$(date +%F).tar.gz" /var/lib/stanciya/uploads
```

### 4.2. Локальный режим (PGlite)
В режиме разработки вся база находится в папке `./.pglite`. Для резервной копии остановите сервер разработки и скопируйте папку `./.pglite` и `./uploads`.
