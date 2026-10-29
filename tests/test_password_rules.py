import json

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.test import Client, TestCase, override_settings

from gathering.models import Classroom, Member
from gathering.services import issue_claim

FAST_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']


@override_settings(PASSWORD_HASHERS=FAST_HASHERS, SECURE_SSL_REDIRECT=False)
class MemberPasswordRuleTests(TestCase):
    """Spec 5.9: ordinary member passwords only need to be non-empty; staff keep Django validators."""

    def setUp(self):
        self.room = Classroom.objects.create(slug='one', name='一班', unlock_password=make_password('class-password'))
        self.user = get_user_model().objects.create_user('member', password='personal-password')
        self.admin = get_user_model().objects.create_user('manager', password='admin-password-long')
        self.member = Member.objects.create(classroom=self.room, name='张同学', student_code='001', user=self.user)
        self.manager = Member.objects.create(classroom=self.room, name='班长', student_code='000', user=self.admin, is_admin=True)
        self.unclaimed = Member.objects.create(classroom=self.room, name='李同学', student_code='002')
        self.base = '/c/one/api/'

    def post(self, route, data, client=None):
        return (client or self.client).post(self.base + route, data=json.dumps(data), content_type='application/json')

    def claim(self, password):
        code, _ = issue_claim(self.unclaimed, self.admin)
        self.post('unlock', {'password': 'class-password'})
        return self.post('claim', {'name': self.unclaimed.name, 'claim_code': code, 'password': password})

    def test_member_claim_accepts_two_digit_password(self):
        self.assertEqual(self.claim('12').status_code, 200)
        fresh = Client()
        fresh.post(self.base + 'unlock', data=json.dumps({'password': 'class-password'}), content_type='application/json')
        self.assertEqual(self.post('login', {'name': self.unclaimed.name, 'password': '12'}, fresh).status_code, 200)

    def test_member_password_change_accepts_one_char(self):
        self.client.force_login(self.user)
        self.assertEqual(self.post('password', {'old_password': 'personal-password', 'password': '7'}).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('7'))

    def test_member_empty_password_rejected(self):
        self.client.force_login(self.user)
        self.assertEqual(self.post('password', {'old_password': 'personal-password', 'password': ''}).status_code, 400)
        self.assertEqual(self.claim('').status_code, 400)

    def test_admin_still_uses_django_validators(self):
        self.client.force_login(self.admin)
        self.assertEqual(self.post('password', {'old_password': 'admin-password-long', 'password': '12'}).status_code, 400)

    def test_login_throttle_still_applies(self):
        fresh = Client()
        fresh.post(self.base + 'unlock', data=json.dumps({'password': 'class-password'}), content_type='application/json')
        codes = [self.post('login', {'name': self.member.name, 'password': f'wrong-{i}'}, fresh).status_code for i in range(20)]
        self.assertIn(429, codes)
