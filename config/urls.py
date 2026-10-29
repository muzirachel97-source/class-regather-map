from django.contrib import admin
from django.urls import include, path
from gathering import views

urlpatterns = [path('admin/', admin.site.urls), path('healthz/', views.health),
               path('', views.home), path('c/<slug:slug>/', include('gathering.urls'))]
