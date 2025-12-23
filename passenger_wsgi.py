    import sys
    import os

    PROJECT_PATH = os.path.join(os.path.dirname(__file__), "PolinClub")
    sys.path.insert(0, PROJECT_PATH)

    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE",
        "PolinClub.settings"
    )

    from django.core.wsgi import get_wsgi_application
    application = get_wsgi_application()