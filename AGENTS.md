# Память проекта для Codex

## Продукт и границы MVP
- Читай `docs/frontend_spec_first_demo_draft.md` перед изменением сценария.
- Сценарий: фото → распознавание + RAG → подтверждение/выбор категории → реальные атрибуты Ozon → ручное заполнение → локальный черновик.
- Не добавлять страницу готовой карточки, публикацию на Ozon, регистрацию, историю, свайпы или автозаполнение характеристик без запроса пользователя.
- Интерфейс на русском: светлый фон, белые панели, синие акценты, простые шаги, адаптивная вёрстка.

## Frontend
- React + Vite, JavaScript, Redux Toolkit + Redux Saga. Пользователь явно запросил Redux/Saga и FSD.
- FSD: `app` собирает store и providers; `pages/create-product` собирает экран; `features/product-setup` содержит сценарий, Redux slice, саги и форму атрибутов; `entities/product` — функции метаданных товара; `shared` — HTTP и общие стили.
- Направление импортов: app → pages → features → entities → shared. Не импортировать верхние слои из нижних.
- API и localStorage вызываются сагами; компоненты диспатчат actions. File/Blob, object URL и состояние drag-and-drop остаются локальными, File допускается только в команде распознавания, не в Redux state.
- Не подменять атрибуты Ozon статическими полями; сохранять обязательность, типы, группы, справочники, множественность и лимиты.
- Dev: `npm --prefix frontend run dev`. Build: `npm --prefix frontend run build`. Preview: `npm --prefix frontend run preview`.
- Проверки: `npm --prefix frontend test`, `npm --prefix frontend run format:check`. Форматирование: `npm --prefix frontend run format`.
- Минимальный Prettier: singleQuote, semi, trailingComma all, printWidth 100.

## Backend и контракт
- FastAPI: `python -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000` из корня.
- `POST /api/recognize-image`: multipart `file` → `rag_keyword`, `ozon_description`.
- `POST /api/generate-description`: `product_name`, `key_features` → category IDs/name либо error. Использует Chroma + VseGPT.
- `GET /api/categories`: актуальное дерево Ozon `result`.
- `POST /api/get-category-attributes`: `description_category_id`, `type_id` → все `attributes` с метаданными.
- `POST /api/attribute-values`: category IDs, `attribute_id`, `last_value_id`, `limit` → Ozon `result`, `has_next`.
- Фото: JPG/PNG/WebP, до 10 МБ; лимит проверяется с обеих сторон.
- Все ключи хранятся только в `backend/.env`. Не читать, выводить, коммитить секреты и не помещать их в VITE_*.
- Vite проксирует `/api` на `BACKEND_URL` (по умолчанию localhost:8000); production использует same-origin `/api` или `VITE_API_BASE_URL`.
- Импорты тяжёлых AI модулей отложены до запроса; синхронные AI вызовы выполняются в threadpool.
- Полный AI/Ozon сценарий требует ключей, сетевого доступа и построенной `chroma_db/`; успешная сборка frontend не подтверждает внешние интеграции.

## Исправления локального запуска и поиска (26.10.2026)
- Основная dev-команда из корня: `npm run dev` (скрипт `scripts/dev.mjs`). Запускает FastAPI, проверяет `/api/health`, затем Vite; использует `.venv/bin/python` или `PYTHON`/python3. Есть `FRONTEND_PORT` для явного выбора порта.
- Минимальные backend-зависимости: `backend/requirements-api.txt`; полный RAG: `backend/requirements.txt` + `python scripts/build_db.py`.
- `POST /api/search-categories` принимает `query`, `limit`, возвращает `categories`, `source` (`rag`/`catalogue`) и `notice`. Использует кандидатов из существующего RAG, а при недоступности — реальный сохранённый каталог `data/ozon_categories.json`; это не мок. Не выдавать fallback за семантический поиск.
- Поиск по названию доступен без фото с первого экрана и после ошибки распознавания; не требовать ручного ввода ID и не привязывать его к ключам Ozon.
- Фото требует Yandex; отсутствие ключей, отказ в доступе и недоступность модели различаются сообщениями. Все AI-настройки читаются из `backend/.env`, также для прямого запуска модулей.
- Vite dev и preview используют один proxy; ошибка подключения возвращается в JSON. strictPort предотвращает незаметный запуск на другом порту.
- При разнице исходников и UI проверить cwd процесса Vite: в этой сессии порт 5173 занимало старое приложение из `.Trash`, а не текущий React проект. Не считать такую страницу результатом новой сборки.

## Цепочка фото и RAG
- Основной фото endpoint: `POST /api/recognize-product`, multipart `file`. Возвращает `rag_keyword`, `ozon_description`, `category` (оба ID + название), `category_source`, `category_notice`, `candidates`; при сбое RAG сохраняет название и возвращает `category_error`/`category_error_code`.
- Frontend сохраняет уже определённую категорию и не запускает второй поиск. Подтверждение категории перед атрибутами остаётся обязательным по ТЗ.
- RAG retrieval сам предлагает реальный тип; VseGPT только уточняет выбор. Отсутствие/ошибка VseGPT не должны уничтожать успешный результат RAG. Не выдумывать confidence.
- `npm run rag:build` строит `chroma_db/` по конечным типам из реального дерева Ozon. Эмбеддинги `intfloat/multilingual-e5-base`, кэш `.cache/models`, нормализация одинакова при индексации и поиске. Стабильные ID, пакетная запись, отсутствие удаления базы и пустых метаданных.
- Переданные пользователем Downloads JSON побайтно совпадают с файлами в data/. Схема `attributes_17028715_96250.json` относится только к горшку для цветов; не использовать её для произвольных категорий. Подходит для интеграционного теста передачи пары ID.
- `/api/health`: service `ozon-card-assistant`, api_version `0.2.0`, capabilities, конфигурационные флаги и готовность RAG. Никогда не включать значения ключей.
- `.env.example` автоматически не читается. Рабочие ключи загружаются из `backend/.env` или окружения процесса.

## Упрощённая форма характеристик
- Пользователь попросил показывать только важные характеристики. Представление строится в `entities/product/model/attribute-layout.js`, форма — `features/product-setup/ui/AttributeForm.jsx`.
- Основные блоки: о товаре, свойства для выбранной категории, размеры/вес, комплектация, требования Ozon. Профили категорий задают приоритет реальным полям API, не создают собственную схему.
- Все обязательные атрибуты остаются видимыми. Необязательные PDF, JSON/rich-контент, видео и интеграционные поля скрываются из формы; прочие редкие необязательные поля доступны в свёрнутом блоке.
- Полная исходная схема и значения сохраняются в Redux и черновике: фильтрация относится только к UI. Подсказки доступны по раскрытию, внутренние ID комплексных групп пользователю не показываются.
