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
    title = models.CharField('Название гайда', max_length=200)
    # description = models.TextField('Описание гайда')
    author = models.CharField('Автор', max_length=100)
    date = models.DateField('Дата публикации')

    content = models.TextField('Контент')

    # img = models.ImageField(
    #     'Изображение',
    #     upload_to='img/%Y',
    #     blank=True
    # )

    video_url = models.URLField(
        'Видео (Google Drive)',
        blank=True
    )

    section = models.ForeignKey(
        Section,
        related_name='posts',
        on_delete=models.CASCADE,
        verbose_name='Раздел'
    )

    class Meta:
        verbose_name = 'Запись'
        verbose_name_plural = 'Записи'

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse('detail', args=[self.id])
