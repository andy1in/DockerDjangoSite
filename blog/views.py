from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import render, get_object_or_404
from django.views import View
from bs4 import BeautifulSoup
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.conf import settings
import logging
import os
import re
import json
from datetime import datetime

from .models import Post, Category

logger = logging.getLogger(__name__)


# =========================
# HELPERS
# =========================

def resolve_category(post):
    """
    Возвращает категорию для:
    - обычной статьи
    - FAQ (через родительскую статью)
    """
    if post.section:
        return post.section.category
    if post.faq_for and post.faq_for.section:
        return post.faq_for.section.category
    return None


def generate_unique_filename(original_filename):
    """Генерирует уникальное имя файла с timestamp и транслитерацией"""
    
    # Словарь транслитерации
    translit_dict = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        ' ': '_', '-': '_'
    }
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    name, ext = os.path.splitext(original_filename)
    
    name = name.lower()
    
    transliterated = ''
    for char in name:
        if char in translit_dict:
            transliterated += translit_dict[char]
        elif char.isalnum() or char in ('_', '-'):
            transliterated += char
        else:
            transliterated += '_'
    
    transliterated = re.sub(r'_+', '_', transliterated)
    transliterated = transliterated.strip('_')
    
    if not transliterated:
        transliterated = 'file'
    
    return f"{transliterated}_{timestamp}{ext.lower()}"


# =========================
# HOME
# =========================

def home(request):
    """Главная страница"""
    return render(request, 'blog/index.html')


# =========================
# POSTS LIST
# =========================

class PostView(LoginRequiredMixin, View):
    """Список категорий → разделов → постов"""

    login_url = 'login'

    def get(self, request):
        user = request.user

        if user.is_superuser:
            categories = Category.objects.prefetch_related(
                'sections__posts'
            ).all()
        else:
            allowed_slugs = []

            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'buyer':
                    allowed_slugs.append('buyer')

            categories = Category.objects.prefetch_related(
                'sections__posts'
            ).filter(slug__in=allowed_slugs)

        return render(request, 'blog/blog.html', {
            'categories': categories
        })


# =========================
# POST DETAIL
# =========================

class PostDetail(LoginRequiredMixin, View):
    """Детальная страница статьи / FAQ"""

    login_url = 'login'

    def get(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        user = request.user

        category = resolve_category(post)

        # ACCESS CONTROL
        if not user.is_superuser and category:
            if user.groups.filter(name='farm').exists() and category.slug != 'farm':
                return render(request, 'blog/forbidden.html')

            if user.groups.filter(name='buyer').exists() and category.slug != 'buyer':
                return render(request, 'blog/forbidden.html')

        # AVAILABLE CATEGORIES
        if user.is_superuser:
            categories = Category.objects.prefetch_related(
                'sections__posts'
            ).all()
        else:
            allowed_slugs = []

            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'buyer':
                    allowed_slugs.append('buyer')

            categories = Category.objects.prefetch_related(
                'sections__posts'
            ).filter(slug__in=allowed_slugs)

        # TOC (h2 / h3)
        soup = BeautifulSoup(post.content, 'html.parser')
        toc = []

        for i, tag in enumerate(soup.find_all(['h2', 'h3'])):
            anchor = f'heading-{i}'
            tag['id'] = anchor
            toc.append({
                'id': anchor,
                'title': tag.get_text(),
            })

        post.content = str(soup)

        return render(request, 'blog/blog_detail.html', {
            'post': post,
            'categories': categories,
            'toc': toc,
        })


# =========================
# PROFILE
# =========================

@login_required(login_url='login')
def profile_view(request):
    """Профиль пользователя"""
    return render(request, 'profile/profile.html')


# =========================
# PRESIGNED URL FOR DIRECT S3 UPLOAD
# =========================

@require_POST
@login_required
def get_presigned_upload_url(request):
    """
    Генерирует presigned URL для прямой загрузки файла на S3.
    Файл загружается напрямую с браузера на S3, минуя Django сервер.
    Это обходит лимиты Cloudflare и nginx.
    """
    import boto3
    from botocore.config import Config
    
    try:
        data = json.loads(request.body)
        filename = data.get('filename')
        content_type = data.get('content_type')
        file_size = data.get('file_size', 0)
        
        if not filename or not content_type:
            return JsonResponse({
                'success': False,
                'error': 'Необходимы filename и content_type'
            }, status=400)
        
        # Проверка типа файла
        allowed_image_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        allowed_video_types = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo']
        
        if content_type in allowed_image_types:
            folder = 'uploads/images'
            max_size = 50 * 1024 * 1024  # 50 MB
        elif content_type in allowed_video_types:
            folder = 'uploads/videos'
            max_size = 2000 * 1024 * 1024  # 2 GB
        else:
            return JsonResponse({
                'success': False,
                'error': f'Неподдерживаемый тип файла: {content_type}'
            }, status=400)
        
        # Проверка размера
        if file_size > max_size:
            return JsonResponse({
                'success': False,
                'error': f'Файл слишком большой. Максимум: {max_size // (1024*1024)} MB'
            }, status=400)
        
        # Генерируем уникальное имя файла
        unique_filename = generate_unique_filename(filename)
        s3_key = f'{folder}/{unique_filename}'
        
        logger.info(f"Генерация presigned URL: {filename} -> {s3_key}, размер: {file_size}, пользователь: {request.user.username}")
        
        # Создаём S3 клиент
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            endpoint_url=os.getenv('AWS_S3_ENDPOINT_URL'),
            region_name=os.getenv('AWS_S3_REGION_NAME', 'ru1'),
            config=Config(signature_version='s3v4')
        )
        
        bucket_name = os.getenv('AWS_STORAGE_BUCKET_NAME')
        
        # Генерируем presigned URL для PUT
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=3600  # URL действителен 1 час
        )
        
        # Финальный URL файла (публичный)
        endpoint_url = os.getenv('AWS_S3_ENDPOINT_URL')
        file_url = f"{endpoint_url}/{bucket_name}/{s3_key}"
        
        logger.info(f"Presigned URL создан для: {s3_key}")
        
        return JsonResponse({
            'success': True,
            'upload_url': presigned_url,
            'file_url': file_url,
            'key': s3_key
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Неверный формат JSON'
        }, status=400)
    except Exception as e:
        logger.error(f"Ошибка генерации presigned URL: {str(e)}", exc_info=True)
        return JsonResponse({
            'success': False,
            'error': f'Ошибка сервера: {str(e)}'
        }, status=500)