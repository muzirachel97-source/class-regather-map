import os
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from gathering.models import Classroom, Member
from gathering.services import import_rows


class Command(BaseCommand):
    help = 'Create fictional demo data in /c/demo/ (DEBUG only, requires DEMO_PASSWORD). Never modifies other classes.'

    @transaction.atomic
    def handle(self, *args, **options):
        password = os.getenv('DEMO_PASSWORD')
        if not settings.DEBUG or not password:
            raise CommandError('Requires DEBUG=1 and DEMO_PASSWORD.')
        if Classroom.objects.filter(slug='demo').exists():
            raise CommandError('Demo already exists; refusing to overwrite it.')
        room = Classroom.objects.create(slug='demo', name='2019 届 · 演示班级', description='演示数据：山海各有归处，见面总有理由。', unlock_password=make_password(password))
        admin = get_user_model().objects.create_superuser('demo-admin', password=password)
        data = [
            ('001', '林晓', 'CHN', '330000', '330100', '杭州市', '2020-07-01', '2022-06-01', 120.155, 30.274, '毕业后的第一站。'),
            ('001', '林晓', 'CHN', '310000', '310000', '上海市', '2022-06-01', '', 121.474, 31.230, '周末常在徐汇，来之前喊我。'),
            ('002', '陈雨', 'CHN', '330000', '330100', '杭州市', '2021-01-01', '', 120.155, 30.274, '在杭州工作，欢迎来喝茶。'),
            ('003', '周宁', 'CHN', '110000', '110000', '北京市', '2020-08-01', '', 116.407, 39.904, '下次回校一起吃饭。'),
            ('004', '许晨', 'CHN', '440000', '440300', '深圳市', '2022-03-01', '', 114.057, 22.543, '周五晚上通常有空。'),
            ('005', '赵一', 'JPN', '', '', '东京', '2023-09-01', '', 139.692, 35.690, '想吃什么我来找店。'),
            ('006', '叶青', 'CHN', '510000', '510100', '成都市', '2020-10-01', '', 104.066, 30.572, '火锅随时约。'),
            ('007', '吴桐', 'CHN', '330000', '330200', '宁波市', '2021-07-01', '', 121.550, 29.874, '可以带你去海边。'),
            ('008', '顾言', 'SGP', '', '', '新加坡', '2024-02-01', '', 103.820, 1.352, '有空过来坐坐。'),
        ]
        rows = [dict(zip(['student_code', 'name', 'country_code', 'province_code', 'city_code', 'city_name', 'started_on', 'ended_on', 'longitude', 'latitude', 'note'], row)) for row in data]
        for row in rows:
            row['coordinate_system'] = 'gcj02' if row['country_code'] == 'CHN' else 'wgs84'
        rows.append({'student_code': '009', 'name': '夏禾'})
        import_rows(room, rows, admin)
        member = Member.objects.get(classroom=room, student_code='001'); member.user = admin; member.is_admin = True; member.save()
        self.stdout.write('Created fictional demo: /c/demo/ ; admin username: demo-admin')
