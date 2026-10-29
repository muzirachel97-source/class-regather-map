from django.core.management.base import BaseCommand, CommandError
from gathering.models import Member


class Command(BaseCommand):
    help = 'Grant or revoke admin rights for one class member (does not grant global Django staff rights).'

    def add_arguments(self, parser):
        parser.add_argument('slug')
        parser.add_argument('student_code')
        parser.add_argument('--revoke', action='store_true')

    def handle(self, *args, **options):
        member = Member.objects.filter(classroom__slug=options['slug'], student_code=options['student_code']).first()
        if not member:
            raise CommandError('No such class member')
        member.is_admin = not options['revoke']
        member.save(update_fields=['is_admin', 'updated_at'])
        self.stdout.write(f'{member.name}: is_admin={member.is_admin}')
