from django.contrib import admin
from django import forms
from django.db import models

from unfold.admin import ModelAdmin
from unfold.contrib.forms.widgets import WysiwygWidget

from .models import Post, Category, Section


# =========================
# FORM
# =========================

class PostAdminForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = "__all__"
        widgets = {
            "content": WysiwygWidget(),  # ✅ только content
        }


# =========================
# POST
# =========================

@admin.register(Post)
class PostAdmin(ModelAdmin):
    form = PostAdminForm

    list_display = (
        'title',
        'author',
        'date',
        'get_category',
        'section',
    )

    list_filter = (
        'date',
        'author',
        'section__category',
        'section',
    )

    search_fields = ('title', 'description', 'author')
    ordering = ('-date',)

    fieldsets = (
        ('Основная информация', {
            'fields': (
                'title',
                'description',
                'author',
                'date',
                'section',
            )
        }),
        ('Контент', {
            'fields': ('content',),
        }),
        ('Обложка', {
            'fields': ('img',),
        }),
    )

    save_on_top = True
    list_per_page = 20

    # 👉 показываем категорию через section
    @admin.display(description='Категория')
    def get_category(self, obj):
        return obj.section.category if obj.section else '—'


# =========================
# CATEGORY
# =========================

@admin.register(Category)
class CategoryAdmin(ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {"slug": ("name",)}


# =========================
# SECTION
# =========================

@admin.register(Section)
class SectionAdmin(ModelAdmin):
    list_display = ('name', 'category', 'slug')
    list_filter = ('category',)
    search_fields = ('name',)
    prepopulated_fields = {"slug": ("name",)}
