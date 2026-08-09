# HOOP

Простой менеджер для отслеживания и _селективного_ скачивания торрентов сериалов на трекерах. В данный момент поддерживаются rutracker, nnm-club и kinozal (с авторизацией).

- Можно искать раздачи через Jackett API и сразу добавлять их в список отслеживания.
- Раздел Discover отображает глобальные trending-сериалы TMDB за неделю/сутки, отсортированные по популярности, через отдельный Cloudflare-прокси.

## Отличия от Sonarr

Sonarr - отличный медиа-менеджер, но не для отслеживания обновляемых раздач на торрент-трекерах. С hoop можно отслеживать раздачи и автоматически скачивать только новые серии (или нужные вручную) селективно. То есть, если вам нужна только одна серия, которая только что обновилась, можно не качать весь сезон заново (или хранить его), а автоматически скачать только нужную серию. HOOP больше похож на TorMon (ex TorrentMonitor).

## Особенности

- 📺 Отслеживание (только одиночных) сезонов и конкретных серий
- 🔍 Поиск через Jackett API
- 🎯 Automatic downloads through Transmission or qBittorrent
- 🔔 Уведомления о загрузках в телеграм

## Требования

- Jackett с настроенным rutracker / nnm-club / kinozal (опционально)
- Transmission or qBittorrent for torrent downloads
- Telegram бот для уведомлений

## Настройка

1. Скопируйте [docker-compose.yml](docker-compose.yml). Заполните переменные окружения.
2. Не забудьте указать верный PUID и GUID пользователя и группы для прав на файлы и папки с данными, включая media и data.
3. Запустите `docker compose up -d`.

Обновление через `docker compose down && docker compose up -d --pull always` загрузит новый образ и перезапустит контейнер.

### Torrent client

Select Transmission or qBittorrent in Settings → Download Settings. qBittorrent requires a connection URL, username, and password; use Test Connection before saving. The default URL examples are `http://localhost:9091/transmission/rpc` for Transmission and `http://localhost:8080` for qBittorrent.

The Download Directory path must be identical inside the HOOP container and the selected torrent client. Existing Transmission deployments can keep using `TRANSMISSION_BASE_URL`, `TRANSMISSION_USERNAME`, and `TRANSMISSION_PASSWORD` when no connection values are saved in HOOP. Do not switch client type while torrents remain attached to another client.

### Discover и TMDB

Discover получает глобальные daily/weekly trending-данные TMDB через отдельный Cloudflare Worker и сортирует первые 10 результатов по убыванию популярности. Для локальной разработки Worker запускается командой `bun run dev:tmdb`; каталог Worker сохраняет legacy-путь `trakt-proxy`.

Задайте секрет командой `cd trakt-proxy && bunx wrangler secret put TMDB_API_TOKEN --config wrangler.tmdb.jsonc`, затем запустите `bun run deploy`. Не добавляйте токен в Wrangler config, репозиторий или клиентский код.

Бесплатное использование TMDB API предназначено для некоммерческих приложений и требует обязательной атрибуции TMDB (логотип и уведомление о том, что приложение использует TMDB API и не одобрено TMDB). Для коммерческого использования требуется отдельное письменное соглашение и commercial API key.

## Использование

1. Откройте `http://<host>:<port>` которые указали в docker-compose.yml
2. Создайте аккаунт при первом входе
3. Заполните настройки

## Стек

- React
- Hono
- Bun

## Конфиденциальность

Не собирает и не передает никаких данных.
