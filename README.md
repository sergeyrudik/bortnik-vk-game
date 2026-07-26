# Бортник — золотые соты

Казуальный match-3 для VK Mini Apps. Игрок меняет соты с нектаром, наполняет
банку мёда, отгоняет ос и развивает пасеку.

- VK Mini App: [vk.ru/app54694415](https://vk.ru/app54694415)
- production: [sergeyrudik-bortnik-vk-game-c295.twc1.net](https://sergeyrudik-bortnik-vk-game-c295.twc1.net/)
- репозиторий: [sergeyrudik/bortnik-vk-game](https://github.com/sergeyrudik/bortnik-vk-game)
- политика конфиденциальности: [production/privacy/](https://sergeyrudik-bortnik-vk-game-c295.twc1.net/privacy/)
- пользовательское соглашение: [production/terms/](https://sergeyrudik-bortnik-vk-game-c295.twc1.net/terms/)

## Стек

- Next.js 16 и React 19;
- TypeScript;
- VK Bridge;
- статический экспорт Next.js в `out/`;
- Timeweb Cloud App Platform.

Игра не требует собственного backend для базового сценария. Прогресс хранится
локально и в VK Storage. Реклама и данные профиля доступны только при запуске
внутри VK.

## Локальный запуск

Требуется Node.js `>=22.13.0` и pnpm.

```bash
pnpm install
pnpm run dev
```

В обычном браузере VK Bridge может быть недоступен — это ожидаемо; игровой
сценарий работает с локальным сохранением.

Полезные команды:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:all
pnpm run timeweb:build
pnpm run moderation:assets
pnpm run moderation:validate
```

Production-сборка с `output: "export"` создаётся в каталоге `out/`. Проверить её
локально:

```bash
pnpm start
```

## Структура

```text
app/
  page.tsx          игровой экран и VK Bridge
  game-engine.ts    логика match-3 и сохранений
  privacy/page.tsx  политика конфиденциальности
  terms/page.tsx    пользовательское соглашение
  globals.css       оформление улья
docs/
  RELEASE_CHECKLIST.md
moderation/         тексты и ассеты для каталога VK
public/             favicon, og
tests/              автотесты
```

## Настройка Timeweb Cloud

Для приложения из GitHub используются следующие параметры:

| Поле | Значение |
| --- | --- |
| Репозиторий | `sergeyrudik/bortnik-vk-game` |
| Ветка | `main` |
| Окружение | Node.js 22 |
| Корень проекта | `/` |
| Команда сборки | `pnpm run timeweb:build` |
| Директория сборки | `out` |
| Команда запуска | `pnpm run timeweb:start` |
| Автодеплой | включён для `main` |

Секретный ключ приложения VK, access token разработчика и токены Timeweb нельзя
добавлять в клиентский код, `.env`, историю Git или настройки сборки
статического приложения. Для текущей версии они не нужны.

Production URL:

```text
https://sergeyrudik-bortnik-vk-game-c295.twc1.net/
```

В настройках VK Mini Apps укажите этот же HTTPS URL для Web, мобильной версии
сайта и мобильного приложения. Сначала проверьте в режиме разработки и тестовой
группе; перед модерацией отключите режим разработки.

## VK

Для зарегистрированного мини-приложения:

1. Укажите Web/Mobile URL: `https://sergeyrudik-bortnik-vk-game-c295.twc1.net/`
2. Адрес `https://vk.ru/app54694415` уже задан как production fallback. Для
   локального переопределения скопируйте `.env.example` в `.env.local`.
3. Загрузите ассеты из `moderation/assets` (сгенерировать: `pnpm run moderation:assets`).

## Геймплей

- поле 6×6, обмен соседних сот;
- цель — наполнить банку мёда (и иногда собрать тип нектара / снять воск);
- спецфишки: пчела (линия), матка (3×3), горшок (весь цвет);
- блокеры: восковые печати и осы;
- вкладки: Улей / Пасека / Задания / Итоги.
