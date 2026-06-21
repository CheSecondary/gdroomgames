from django.urls import path
from . import views

urlpatterns = [
    path("health/",               views.HealthCheckView.as_view()),
    path("agora-token/",          views.AgoraTokenView.as_view()),
    path("lobby/",                views.ListWaitingGamesView.as_view()),
    path("create/",               views.CreateGameView.as_view()),
    path("join/",                 views.JoinGameView.as_view()),
    path("resume-export/",        views.ResumeFromExportView.as_view()),
    path("<str:code>/history/",   views.RoundHistoryView.as_view()),
    path("<str:code>/",           views.GameDetailView.as_view()),
]
