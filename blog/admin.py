from django.contrib import admin
from .models import Post, Category


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    # Что видно в списке
    list_display = ('title', 'author', 'date', 'category')  # добавили category
    list_filter = ('date', 'author', 'category')  # добавили фильтр по категории
    search_fields = ('title', 'description', 'author')
    ordering = ('-date',)

    # Автозаполнение slug-полей (если добавишь в будущем)
    prepopulated_fields = {}

    # Разметка формы редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('title', 'description', 'author', 'date', 'category')  # добавили category
        }),
        ('Контент', {
            'fields': ('content',),
        }),
        ('Обложка', {
            'fields': ('img',),
        }),
    )

    # Улучшение UX
    save_on_top = True
    list_per_page = 20


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {"slug": ("name",)}  # автоматически заполняем slug
