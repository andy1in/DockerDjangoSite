from django.db import models
from django_ckeditor_5.fields import CKEditor5Field
from django.urls import reverse


class Category(models.Model):
    """Категории постов"""
    name = models.CharField('Категория', max_length=100)
    slug = models.SlugField(unique=True)

    def __str__(self):
        return self.name


class Post(models.Model):
    title = models.CharField('Название гайда', max_length=200)
    description = models.TextField('Описание гайда')
    author = models.CharField('Автор', max_length=100)
    date = models.DateField('Дата публикации')

    content = CKEditor5Field('Контент', config_name='default')

    img = models.ImageField(
        'Изображение',
        upload_to='img/%Y',
        blank=True
    )

    video_url = models.URLField(
        'Видео (Google Drive)',
        blank=True
    )

    category = models.ForeignKey(
        Category,
        related_name='posts',
        on_delete=models.CASCADE
    )

    def get_absolute_url(self):
        return reverse('detail', args=[self.id])

    def __str__(self):
        return f'{self.title}, {self.author}'

    class Meta:
        verbose_name = 'Запись'
        verbose_name_plural = 'Записи'
