from django.contrib import admin
from django import forms

from unfold.admin import ModelAdmin
from unfold.contrib.forms.widgets import WysiwygWidget

from .models import Post, Category, Section
from django.contrib.admin import SimpleListFilter


# =========================
# FILTER
# =========================

class PostTypeFilter(SimpleListFilter):
    title = 'Тип поста'
    parameter_name = 'type'

    def lookups(self, request, model_admin):
        return (
            ('article', 'Статья'),
            ('faq', 'FAQ'),
        )

    def queryset(self, request, queryset):
        if self.value() == 'article':
            return queryset.filter(faq_for__isnull=True)
        if self.value() == 'faq':
            return queryset.filter(faq_for__isnull=False)
        return queryset


# =========================
# FORM
# =========================

class PostAdminForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = "__all__"
        widgets = {
            "content": WysiwygWidget(),
        }


# =========================
# POST
# =========================

@admin.register(Post)
class PostAdmin(ModelAdmin):
    form = PostAdminForm

    list_display = (
        'title',
        'get_type',
        'author',
        'date',
        'get_category',
        'section',
    )

    list_filter = (
        PostTypeFilter,
        'date',
        'author',
        'section__category',
        'section',
        'faq_for',
    )

    search_fields = ('title', 'author')
    ordering = ('-date',)

    fieldsets = (
        ('Основное', {
            'fields': (
                'title',
                'author',
                'date',
                'section',
            )
        }),
        ('Контент', {
            'fields': ('content',),
        }),
        ('FAQ', {
            'fields': ('faq_for',),
        }),
    )

    save_on_top = True
    list_per_page = 20

    @admin.display(description='Тип')
    def get_type(self, obj):
        return 'FAQ' if obj.faq_for else 'Статья'

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
