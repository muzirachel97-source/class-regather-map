from django.core.management.base import BaseCommand
from django.utils import timezone
from gathering.models import RateBucket


class Command(BaseCommand):
    help = 'Remove expired rate limit rows; safe to run daily alongside clearsessions.'

    def handle(self, *args, **options):
        count, _ = RateBucket.objects.filter(expires_at__lt=timezone.now()).delete()
        self.stdout.write(str(count))
