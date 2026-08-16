from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Profile


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    inlines = [ProfileInline]

    # 👇 columns shown in the user list
    list_display = ['id','email', 'username', 'full_name', 'is_staff', 'is_active']
    search_fields = ['email', 'username', 'full_name']
    ordering = ['email']

    # 👇 fields shown when editing a user
    fieldsets = (
        (None,           {'fields': ('email', 'username', 'password')}),
        ('Personal',     {'fields': ('full_name',)}),
        ('Permissions',  {'fields': ('is_staff', 'is_active', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates',        {'fields': ('last_login', 'date_joined')}),
    )

    # 👇 fields shown when creating a user from admin
    add_fieldsets = (
        (None, {
            'fields': ('email', 'username', 'full_name', 'password1', 'password2'),
        }),
    )


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ['id','get_username','get_email','phone','image']

    search_fields=['user__username','user__email']

    def get_username(self,obj):
        return obj.user.username
    get_username.short_description='Username'

    def get_email(self,obj):
        return obj.user.email
    get_email.short_description='Email'