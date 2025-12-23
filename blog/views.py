from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import render, get_object_or_404
from django.views.generic.base import View
from bs4 import BeautifulSoup

from .models import Post, Category


def home(request):
    """Главная страница"""
    return render(request, 'blog/index.html')


class PostView(LoginRequiredMixin, View):
    """Вывод списка записей с фильтрацией по группам пользователей"""

    login_url = 'login'

    def get(self, request, *args, **kwargs):
        user = request.user

        # Фильтруем категории по группе пользователя
        if user.is_superuser:
            categories = Category.objects.prefetch_related('posts').all()
        else:
            allowed_slugs = []
            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'baer':
                    allowed_slugs.append('baer')

            categories = Category.objects.prefetch_related('posts').filter(slug__in=allowed_slugs)

        return render(request, 'blog/blog.html', {
            'categories': categories
        })


class PostDetail(LoginRequiredMixin, View):
    """Отдельная страница записи с фильтрацией категорий и постов"""

    login_url = 'login'

    def get(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        user = request.user

        # Проверка доступа к текущей статье
        if not user.is_superuser:
            if user.groups.filter(name='farm').exists() and post.category.slug != 'farm':
                return render(request, 'blog/forbidden.html')
            elif user.groups.filter(name='baer').exists() and post.category.slug != 'baer':
                return render(request, 'blog/forbidden.html')

        # Фильтрация категорий и постов по группе пользователя
        if user.is_superuser:
            categories = Category.objects.prefetch_related('posts').all()
        else:
            allowed_slugs = []
            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'baer':
                    allowed_slugs.append('baer')
            categories = Category.objects.prefetch_related('posts').filter(slug__in=allowed_slugs)

        # Автоматическое оглавление по h2/h3
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
            'categories': categories,  # уже отфильтрованные категории
            'toc': toc,
        })


@login_required(login_url='login')
def profile_view(request):
    """Профиль пользователя"""
    return render(request, 'profile/profile.html')
