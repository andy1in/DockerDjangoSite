from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

# Заглушка для Chrome DevTools
@require_http_methods(["GET"])
def devtools_stub(request):
    """Заглушка для Chrome DevTools - предотвращает 404 в логах"""
    return JsonResponse({}, status=200)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('blog.urls')),
    path('accounts/', include('django.contrib.auth.urls')),
    
    # Заглушка для Chrome DevTools (убирает 404 из логов)
    path('.well-known/appspecific/com.chrome.devtools.json', devtools_stub),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)