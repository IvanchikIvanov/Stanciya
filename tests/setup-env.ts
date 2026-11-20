// Автотесты работают с отдельной базой в памяти, чтобы не трогать
// рабочую базу разработки (./.pglite) и не конфликтовать с запущенным сервером.
process.env.DATABASE_URL = 'memory://';
// Подсчёт невыкупленных заказов проверяется тестами, хотя в интерфейсе метка выключена
process.env.ENABLE_NO_SHOW_COUNTER = 'true';
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT ?? 'true';
