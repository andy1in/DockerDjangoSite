from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import render, get_object_or_404
from django.views import View
from bs4 import BeautifulSoup
from django.http import JsonResponse
from django.views.decorators.http import require_POST
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
    if post.section:
        return post.section.category
    if post.faq_for and post.faq_for.section:
        return post.faq_for.section.category
    return None


def generate_unique_filename(original_filename):
    """Генерирует уникальное имя файла с timestamp и транслитерацией"""
    
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
    return render(request, 'blog/index.html')


# =========================
# POSTS LIST
# =========================

class PostView(LoginRequiredMixin, View):
    login_url = 'login'

    def get(self, request):
        user = request.user

        if user.is_superuser:
            categories = Category.objects.prefetch_related('sections__posts').all()
        else:
            allowed_slugs = []
            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'buyer':
                    allowed_slugs.append('buyer')

            categories = Category.objects.prefetch_related('sections__posts').filter(slug__in=allowed_slugs)

        return render(request, 'blog/blog.html', {'categories': categories})


# =========================
# POST DETAIL
# =========================

class PostDetail(LoginRequiredMixin, View):
    login_url = 'login'

    def get(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        user = request.user
        category = resolve_category(post)

        if not user.is_superuser and category:
            if user.groups.filter(name='farm').exists() and category.slug != 'farm':
                return render(request, 'blog/forbidden.html')
            if user.groups.filter(name='buyer').exists() and category.slug != 'buyer':
                return render(request, 'blog/forbidden.html')

        if user.is_superuser:
            categories = Category.objects.prefetch_related('sections__posts').all()
        else:
            allowed_slugs = []
            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'buyer':
                    allowed_slugs.append('buyer')
            categories = Category.objects.prefetch_related('sections__posts').filter(slug__in=allowed_slugs)

        soup = BeautifulSoup(post.content, 'html.parser')
        toc = []

        for i, tag in enumerate(soup.find_all(['h2', 'h3'])):
            anchor = f'heading-{i}'
            tag['id'] = anchor
            toc.append({'id': anchor, 'title': tag.get_text()})

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
    return render(request, 'profile/profile.html')


# =========================
# PRESIGNED URL FOR S3 UPLOAD VIA NGINX PROXY
# =========================

@require_POST
@login_required
def get_presigned_upload_url(request):
    """
    Генерирует presigned URL для загрузки на S3 через nginx прокси.
    Это обходит CORS и Cloudflare.
    
    Схема:
    1. Django генерирует presigned URL для S3
    2. URL переписывается на nginx прокси: /s3-upload/...
    3. Браузер отправляет PUT на nginx
    4. Nginx проксирует на S3 с оригинальной подписью
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
            ExpiresIn=3600  # 1 час
        )
        
        # КЛЮЧЕВОЕ: Заменяем прямой S3 URL на upload поддомен (без Cloudflare)
        # Это обходит лимит 100MB Cloudflare!
        # Было: https://s3.ru1.storage.beget.cloud/bucket/path?signature...
        # Стало: https://upload.traff-lab.ru/s3-upload/path?signature...
        
        s3_base = f"https://s3.ru1.storage.beget.cloud/{bucket_name}/"
        proxy_base = "https://upload.traff-lab.ru/s3-upload/"
        
        proxy_upload_url = presigned_url.replace(s3_base, proxy_base)
        
        # URL для чтения файла через Django прокси (с авторизацией)
        file_url = f"https://traff-lab.ru/s3-media/{s3_key}"
        
        logger.info(f"Presigned URL создан, прокси: {proxy_upload_url[:100]}...")
        
        return JsonResponse({
            'success': True,
            'upload_url': proxy_upload_url,
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


# =========================
# S3 MEDIA PROXY WITH AUTH
# =========================

@login_required(login_url='login')
def serve_s3_media(request, path):
    """
    Проксирует файлы из S3 для авторизованных пользователей.
    URL: /s3-media/<path>
    """
    import boto3
    from botocore.config import Config
    from django.http import StreamingHttpResponse, HttpResponse
    
    # Проверяем что путь начинается с uploads/ (безопасность)
    if not path.startswith('uploads/'):
        return HttpResponse('Forbidden', status=403)
    
    try:
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
        
        # Получаем файл из S3
        try:
            # Проверяем Range заголовок для видео
            range_header = request.META.get('HTTP_RANGE')
            
            if range_header:
                # Частичный запрос (для видео)
                s3_response = s3_client.get_object(
                    Bucket=bucket_name,
                    Key=path,
                    Range=range_header
                )
                status_code = 206
            else:
                s3_response = s3_client.get_object(
                    Bucket=bucket_name,
                    Key=path
                )
                status_code = 200
                
        except s3_client.exceptions.NoSuchKey:
            return HttpResponse('Not Found', status=404)
        
        # Определяем Content-Type
        content_type = s3_response.get('ContentType', 'application/octet-stream')
        
        # Стриминг ответа
        def stream_file():
            body = s3_response['Body']
            chunk_size = 8192
            while True:
                chunk = body.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        
        response = StreamingHttpResponse(
            stream_file(),
            content_type=content_type,
            status=status_code
        )
        
        # Копируем важные заголовки от S3
        if 'ContentLength' in s3_response:
            response['Content-Length'] = s3_response['ContentLength']
        if 'ContentRange' in s3_response:
            response['Content-Range'] = s3_response['ContentRange']
        if 'AcceptRanges' in s3_response:
            response['Accept-Ranges'] = s3_response['AcceptRanges']
        else:
            response['Accept-Ranges'] = 'bytes'
            
        # Кэширование для авторизованных
        response['Cache-Control'] = 'private, max-age=86400'
        
        return response
        
    except Exception as e:
        logger.error(f"Ошибка проксирования S3: {str(e)}", exc_info=True)
        return HttpResponse(f'Error: {str(e)}', status=500)


@require_POST
@login_required
def make_file_public(request):
    """
    Устанавливает public-read ACL для файла после загрузки.
    Вызывается после успешной загрузки на S3.
    """
    import boto3
    from botocore.config import Config
    
    try:
        data = json.loads(request.body)
        s3_key = data.get('key')
        
        if not s3_key:
            return JsonResponse({
                'success': False,
                'error': 'Необходим key файла'
            }, status=400)
        
        # Проверяем что ключ начинается с uploads/ (безопасность)
        if not s3_key.startswith('uploads/'):
            return JsonResponse({
                'success': False,
                'error': 'Недопустимый путь файла'
            }, status=400)
        
        logger.info(f"Установка public-read ACL для: {s3_key}")
        
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
        
        # Устанавливаем ACL
        s3_client.put_object_acl(
            Bucket=bucket_name,
            Key=s3_key,
            ACL='public-read'
        )
        
        # Публичный URL файла
        endpoint_url = os.getenv('AWS_S3_ENDPOINT_URL')
        file_url = f"{endpoint_url}/{bucket_name}/{s3_key}"
        
        logger.info(f"ACL установлен, публичный URL: {file_url}")
        
        return JsonResponse({
            'success': True,
            'url': file_url
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Неверный формат JSON'
        }, status=400)
    except Exception as e:
        logger.error(f"Ошибка установки ACL: {str(e)}", exc_info=True)
        return JsonResponse({
            'success': False,
            'error': f'Ошибка сервера: {str(e)}'
        }, status=500)