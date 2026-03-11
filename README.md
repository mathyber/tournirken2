# Турниркен

Полнофункциональное веб-приложение для управления и проведения онлайн-турниров по играм.

## Стек технологий

**Backend:** Node.js + TypeScript, Fastify, Prisma ORM + SQLite, JWT аутентификация

**Frontend:** React 18 + TypeScript, Vite, TanStack Query, TanStack Router, Zustand, shadcn/ui + Tailwind CSS, React Flow

**Монорепозиторий:** pnpm workspaces

## Быстрый старт

### Предварительные требования

- Node.js 18+
- pnpm 9+

### Установка

```bash
pnpm install
```

### Настройка окружения

Скопируйте `.env.example` в `.env`:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Переменные окружения API (`apps/api/.env`):
```
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET="ваш-секретный-ключ"
JWT_REFRESH_SECRET="ваш-refresh-ключ"
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

Переменные окружения Web (`apps/web/.env`):
```
VITE_API_URL=http://localhost:3001
```

### База данных

```bash
# Создать и применить миграции
pnpm db:migrate

# Заполнить тестовыми данными (создаёт admin пользователя)
pnpm db:seed

# Открыть Prisma Studio
pnpm db:studio
```

### Запуск в режиме разработки

```bash
pnpm dev
```

Приложение будет доступно:
- Frontend: http://localhost:5173
- API: http://localhost:3001
- API Health: http://localhost:3001/api/health

### Данные для входа по умолчанию

```
Логин: admin
Пароль: admin123
```

> ⚠️ Обязательно смените пароль после первого входа!

## Форматы турниров

| Формат | Описание |
|--------|----------|
| **SINGLE_ELIMINATION** | Олимпийская система. Проигравший выбывает. |
| **DOUBLE_ELIMINATION** | Двойное выбывание. Есть шанс через нижнюю сетку. |
| **ROUND_ROBIN** | Круговая система. Каждый играет с каждым. |
| **SWISS** | Швейцарская система. N раундов, пары по уровню. |
| **MIXED** | Смешанная. Группы + Плей-офф лучших. |

## Структура проекта

```
tournirken/
├── apps/
│   ├── api/          # Fastify backend
│   │   ├── prisma/   # Схема БД и миграции
│   │   └── src/
│   │       ├── lib/      # Prisma клиент, утилиты
│   │       ├── plugins/  # Fastify плагины (auth)
│   │       ├── routes/   # Маршруты API
│   │       └── services/ # Алгоритмы турнирных сеток
│   └── web/          # React frontend
│       └── src/
│           ├── api/        # API клиенты
│           ├── components/ # UI компоненты
│           ├── routes/     # Страницы (TanStack Router)
│           └── stores/     # Zustand store
└── packages/
    └── shared/       # Общие схемы Zod и типы TypeScript
```

## API Эндпоинты

### Аутентификация
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход
- `POST /api/auth/refresh` — обновление токена
- `POST /api/auth/logout` — выход

### Пользователи
- `GET /api/users/:login` — публичный профиль
- `GET /api/users/me` — свой профиль
- `PATCH /api/users/me/email` — смена email
- `PATCH /api/users/me/password` — смена пароля

### Турниры
- `GET /api/tournaments` — список (с фильтрами и пагинацией)
- `GET /api/tournaments/:id` — детали турнира
- `POST /api/tournaments` — создать
- `PATCH /api/tournaments/:id` — изменить
- `DELETE /api/tournaments/:id` — отменить

### Участие
- `POST /api/tournaments/:id/join` — записаться
- `DELETE /api/tournaments/:id/leave` — покинуть
- `GET /api/tournaments/:id/participants` — список участников

### Турнирная сетка
- `POST /api/tournaments/:id/grid/draft` — сохранить черновик
- `POST /api/tournaments/:id/grid/finalize` — запустить турнир
- `GET /api/tournaments/:id/grid` — получить сетку

### Матчи
- `GET /api/matches/:id` — детали матча
- `POST /api/matches/:id/result` — установить результат
- `GET /api/tournaments/:id/matches` — все матчи турнира
- `GET /api/tournaments/:id/groups` — группы со стандингами

### Администрирование
- `GET /api/admin/users` — список пользователей
- `PATCH /api/admin/users/:id/roles` — изменить роли
- `DELETE /api/admin/tournaments/:id` — отменить турнир
