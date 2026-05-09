import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application

# Initialise Django app registry BEFORE importing any app modules (models, consumers, etc.)
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
import game.routing

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(game.routing.websocket_urlpatterns),
    }
)
