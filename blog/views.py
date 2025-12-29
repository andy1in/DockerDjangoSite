from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import render, get_object_or_404
from django.views import View
from bs4 import BeautifulSoup

from .models import Post, Category


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

        # 🔹 определяем категорию корректно
        category = resolve_category(post)

        # =========================
        # ACCESS CONTROL
        # =========================
        if not user.is_superuser and category:
            if user.groups.filter(name='farm').exists() and category.slug != 'farm':
                return render(request, 'blog/forbidden.html')

            if user.groups.filter(name='buyer').exists() and category.slug != 'buyer':
                return render(request, 'blog/forbidden.html')

        # =========================
        # AVAILABLE CATEGORIES
        # =========================
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

        # =========================
        # TOC (h2 / h3)
        # =========================
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
