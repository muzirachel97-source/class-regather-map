import getpass
import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_slug
from gathering.models import Classroom


class Command(BaseCommand):
    help = 'Create a class. Password comes from CLASS_UNLOCK_PASSWORD or an interactive hidden prompt.'

    def add_arguments(self, parser):
        parser.add_argument('--slug', default='our-class')
        parser.add_argument('--name', default='我们的班级')
        parser.add_argument('--public', action='store_true', help='Explicitly create a class without a viewing password')

    def handle(self, *args, **options):
        slug = options['slug']
        try:
            validate_slug(slug)
        except ValidationError as error:
            raise CommandError(str(error))
        if Classroom.objects.filter(slug=slug).exists():
            raise CommandError('Class already exists; use its management page to change settings.')
        password = '' if options['public'] else os.getenv('CLASS_UNLOCK_PASSWORD') or getpass.getpass('班级解锁密码：')
        if not options['public']:
            try:
                validate_password(password)
            except ValidationError as error:
                raise CommandError('; '.join(error.messages))
        classroom = Classroom(slug=slug, name=options['name'], unlock_password=make_password(password) if password else '')
        classroom.full_clean()
        classroom.save()
        self.stdout.write(self.style.SUCCESS(f'Created /c/{slug}/; create a superuser with createsuperuser to administer it.'))
