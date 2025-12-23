from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('blog/', views.PostView.as_view(), name='course'),
    path('blog/<int:pk>/', views.PostDetail.as_view(), name='detail'),
    path('posts/', views.PostView.as_view(), name='post_list'),
    path('profile/', views.profile_view, name='profile'),
]
