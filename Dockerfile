# Используем официальный образ Python 3.14.2 slim
FROM python:3.14.2-slim

# Устанавливаем системные зависимости для Pillow и других пакетов
RUN apt-get update && apt-get install -y \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    libpq-dev \
    git \
    vim \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY requirements.txt .

# Устанавливаем зависимости Python
RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . .

# Указываем команду по умолчанию (запуск Django через Gunicorn)
# Предположим, что ваше приложение Django называется "myproject"
CMD ["sh", "-c", "python manage.py migrate && gunicorn PolinClub.wsgi:application --bind 0.0.0.0:8000"]
