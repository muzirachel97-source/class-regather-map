from django.contrib import admin
from .models import AuditEvent, Classroom, Location, Member


class SuperuserReadOnly(admin.ModelAdmin):
    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Classroom)
class ClassroomAdmin(SuperuserReadOnly):
    list_display = ['name', 'slug', 'created_at']
    exclude = ['unlock_password']


@admin.register(Member)
class MemberAdmin(SuperuserReadOnly):
    list_display = ['name', 'classroom', 'student_code', 'is_admin']
    list_filter = ['classroom']
    exclude = ['claim_hash']


@admin.register(Location)
class LocationAdmin(SuperuserReadOnly):
    list_display = ['member', 'country_code', 'province_code', 'city_name', 'started_on', 'ended_on']


@admin.register(AuditEvent)
class AuditAdmin(SuperuserReadOnly):
    list_display = ['created_at', 'classroom', 'actor', 'action', 'member']
    list_filter = ['classroom', 'action']


admin.site.site_header = '班级蹭饭地图 · 系统管理'
admin.site.index_title = '班级数据与审计（编辑请返回地图）'
