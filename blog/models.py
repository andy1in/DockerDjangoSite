from django.db import models
from django.urls import reverse


class Category(models.Model):
    """Категории"""
    name = models.CharField('Категория', max_length=100)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name = 'Категория'
        verbose_name_plural = 'Категории'

    def __str__(self):
        return self.name


class Section(models.Model):
    """Разделы внутри категории"""
    name = models.CharField('Раздел', max_length=100)
    slug = models.SlugField()
    category = models.ForeignKey(
        Category,
        related_name='sections',
        on_delete=models.CASCADE,
        verbose_name='Категория'
    )

    class Meta:
        verbose_name = 'Раздел'
        verbose_name_plural = 'Разделы'
        unique_together = ('slug', 'category')

    def __str__(self):
        return f'{self.category.name} → {self.name}'


class Post(models.Model):
    title = models.CharField('Название', max_length=200)
    author = models.CharField('Автор', max_length=100)
    date = models.DateField('Дата публикации')

    content = models.TextField('Контент')

    video_url = models.URLField(
        'Видео (Google Drive)',
        blank=True
    )

    section = models.ForeignKey(
        Section,
        related_name='posts',
        on_delete=models.CASCADE,
        verbose_name='Раздел',
        null=True,
        blank=True
    )

    # 🔥 ВАЖНО: родительская статья
    faq_for = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        related_name='faqs',
        verbose_name='FAQ для статьи',
        null=True,
        blank=True,
        help_text='Если это FAQ — выбери статью, к которой он относится'
    )

    class Meta:
        verbose_name = 'Запись'
        verbose_name_plural = 'Записи'

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse('detail', args=[self.id])
