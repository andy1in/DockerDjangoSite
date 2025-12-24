from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import render, get_object_or_404
from django.views.generic.base import View
from bs4 import BeautifulSoup
import random

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
                elif group.name.lower() == 'buyer':
                    allowed_slugs.append('buyer')

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
            elif user.groups.filter(name='buyer').exists() and post.category.slug != 'buyer':
                return render(request, 'blog/forbidden.html')

        # Фильтрация категорий и постов по группе пользователя
        if user.is_superuser:
            categories = Category.objects.prefetch_related('posts').all()
        else:
            allowed_slugs = []
            for group in user.groups.all():
                if group.name.lower() == 'farm':
                    allowed_slugs.append('farm')
                elif group.name.lower() == 'buyer':
                    allowed_slugs.append('buyer')
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

         # Список для случайных постов
        random_posts = {}
        # print(post.category)
        # posts = Post.objects.all()
        # for _ in posts:
        #     print(_.id, _.title, _.category)

        
        current_category_posts = Post.objects.filter(category=post.category).exclude(id=post.id)
        if current_category_posts.exists():  # Проверяем, есть ли посты
            if current_category_posts.count() >= 2:
                random_posts['current_category'] = random.sample(list(current_category_posts), 2)
            else:
                random_posts['current_category'] = list(current_category_posts)
        else:
            random_posts['current_category'] = []

        print(random_posts)
        print(post)

        # Для всех остальных категорий, 3 случайных поста из каждой категории
        for category in categories:
            if category != post.category:  # Исключаем текущую категорию
                other_category_posts = Post.objects.filter(category=category).exclude(id=post.id)

                # Проверка на наличие постов в других категориях
                if other_category_posts.exists():  # Проверяем, есть ли посты
                    if other_category_posts.count() >= 3:
                        random_posts[category.id] = random.sample(list(other_category_posts), 3)
                    else:
                        random_posts[category.id] = list(other_category_posts)
                else:
                    random_posts[category.id] = []

        print(random_posts)

        return render(request, 'blog/blog_detail.html', {
            'post': post,
            'categories': categories,  # уже отфильтрованные категории
            'toc': toc,
            'random_posts': random_posts, 
        })


@login_required(login_url='login')
def profile_view(request):
    """Профиль пользователя"""
    return render(request, 'profile/profile.html')
