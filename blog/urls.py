from django.urls import path, re_path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('blog/', views.PostView.as_view(), name='course'),
    path('blog/<int:pk>/', views.PostDetail.as_view(), name='detail'),
    path('posts/', views.PostView.as_view(), name='post_list'),
    path('profile/', views.profile_view, name='profile'),
    
    # Presigned URL для прямой загрузки на S3 через nginx прокси
    path("get-presigned-url/", views.get_presigned_upload_url, name="get_presigned_url"),
    
    # Проксирование S3 файлов с проверкой авторизации
    re_path(r'^s3-media/(?P<path>.+)$', views.serve_s3_media, name="serve_s3_media"),
]