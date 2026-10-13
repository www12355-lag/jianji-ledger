import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from app import Service, APIError, clean_report, make_server


class FriendsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = Service(os.path.join(self.temp.name, 'ledger.db'), 'private-enrollment-code')
        self.a = self.register('alice', '小林')
        self.b = self.register('bob', '小周')
        self.c = self.register('carol', '第三人')
        self.report = dict(mode='week', start='2026-10-05', end='2026-10-11', through='2026-10-11',
                           hideAmounts=True, hideCategories=True, income=12345, net=321, balance=12024,
                           count=4, recordedDays=2, categories=[{'name': '私人分类', 'percent': 100}], budget=None,
                           note='PRIVATE', merchant='SECRET', photos=['PRIVATE'])

    def tearDown(self):
        self.temp.cleanup()

    def register(self, username, nickname):
        return self.service.handle('POST', '/v1/auth/register', dict(username=username, nickname=nickname,
              password='long-secret-password', enrollment='private-enrollment-code'))

    def test_custom_enrollment_code(self):
        service=Service(os.path.join(self.temp.name,'custom.db'),'trial42')
        body=dict(username='tester',nickname='测试',password='long-secret-password',enrollment='old-registration-code')
        with self.assertRaises(APIError) as failure:
            service.handle('POST','/v1/auth/register',body)
        self.assertEqual(failure.exception.status,403)
        created=service.handle('POST','/v1/auth/register',{**body,'enrollment':'trial42'})
        self.assertEqual(created['user']['username'],'tester')

    def test_friend_details_and_private_remark(self):
        other=self.b['user']['id']
        self.friend(self.a,self.b)
        self.call(self.b,'PATCH','/v1/me',{'nickname':'同名好友','avatar':'mint','bio':'PRIVATE INTRO'})
        own=self.call(self.a,'PATCH','/v1/friends/'+other,{'remark':'大学同学'})['friend']
        self.assertEqual(own['remark'],'大学同学')
        self.assertEqual(own['avatar'],'mint')
        self.assertNotIn('bio',own)
        seen=self.call(self.a,'GET','/v1/friends')['friends'][0]
        self.assertEqual(seen['username'],'bob')
        self.assertEqual(seen['remark'],'大学同学')
        self.assertEqual(self.call(self.b,'GET','/v1/friends/'+self.a['user']['id'])['friend']['remark'],'')
        with self.assertRaises(APIError):
            self.call(self.c,'GET','/v1/friends/'+other)
        with self.assertRaises(APIError):
            self.call(self.a,'PATCH','/v1/friends/'+other,{'remark':'x'*41})
        reopened=Service(self.service.db_path,'private-enrollment-code')
        self.assertEqual(reopened.handle('GET','/v1/friends/'+other,{},self.a['token'])['friend']['remark'],'大学同学')
        self.call(self.a,'DELETE','/v1/friends/'+other)
        self.friend(self.a,self.b)
        self.assertEqual(self.call(self.a,'GET','/v1/friends/'+other)['friend']['remark'],'')

    def call(self, user, method, path, body=None):
        return self.service.handle(method, path, body or {}, user['token'])

    def friend(self, a, b):
        self.call(a, 'POST', '/v1/requests', {'code': b['user']['inviteCode']})
        request = self.call(b, 'GET', '/v1/requests')['incoming'][0]
        self.call(b, 'POST', '/v1/requests/' + request['id'])

    def test_profile_and_private_chat(self):
        updated=self.call(self.a,'PATCH','/v1/me',{'nickname':'小林的新名字','bio':'每天记一点','avatar':'mint'})
        self.assertEqual(updated['user']['bio'],'每天记一点')
        self.assertEqual(self.call(self.a,'GET','/v1/me')['user']['avatar'],'mint')
        other=self.b['user']['id']
        with self.assertRaises(APIError):
            self.call(self.a,'POST','/v1/messages/'+other,{'content':'hello','clientId':'a'*32})
        self.friend(self.a,self.b)
        body={'content':'今天记账了吗？\n一起加油 <script>','clientId':'a'*32}
        first=self.call(self.a,'POST','/v1/messages/'+other,body)['message']
        retry=self.call(self.a,'POST','/v1/messages/'+other,body)['message']
        self.assertEqual(first['id'],retry['id'])
        self.assertEqual(self.call(self.b,'GET','/v1/conversations')['conversations'][0]['unread'],1)
        path='/v1/messages/'+self.a['user']['id']
        self.assertEqual(self.call(self.b,'GET',path)['messages'][0]['content'],body['content'])
        self.assertNotIn('client',self.call(self.b,'GET',path)['messages'][0])
        self.assertEqual(self.call(self.a,'GET','/v1/messages/'+other)['messages'][0]['client'],body['clientId'])
        self.assertEqual(self.call(self.b,'GET','/v1/conversations')['conversations'][0]['unread'],0)
        with self.assertRaises(APIError):
            self.call(self.c,'GET',path)
        with self.assertRaises(APIError):
            self.call(self.a,'POST','/v1/messages/'+other,{**body,'content':'different'})
        self.call(self.a,'DELETE','/v1/friends/'+other)
        with self.assertRaises(APIError):
            self.call(self.b,'GET',path)

    def test_chat_pagination_and_limits(self):
        self.friend(self.a,self.b)
        other=self.b['user']['id']
        for index in range(52):
            self.service.rates.clear()
            self.call(self.a,'POST','/v1/messages/'+other,{'content':str(index),'clientId':format(index,'032x')})
        recent=self.call(self.b,'GET','/v1/messages/'+self.a['user']['id'])
        self.assertEqual(len(recent['messages']),50)
        self.assertTrue(recent['hasMore'])
        older=self.call(self.b,'GET','/v1/messages/'+self.a['user']['id']+'/before/'+str(recent['messages'][0]['id']))
        self.assertEqual([m['content'] for m in older['messages']],['0','1'])
        self.assertFalse(older['hasMore'])
        for content in ['', 'x'*2001, '\x00']:
            with self.assertRaises(APIError):
                self.call(self.a,'POST','/v1/messages/'+other,{'content':content,'clientId':'f'*32})

    def test_permissions_and_revocation(self):
        with self.assertRaises(APIError):
            self.call(self.a, 'POST', '/v1/reports', {'report': self.report, 'recipients': [self.b['user']['id']]})
        self.friend(self.a, self.b)
        self.assertEqual(len(self.call(self.a, 'GET', '/v1/friends')['friends']), 1)
        posted = self.call(self.a, 'POST', '/v1/reports', {'report': self.report, 'recipients': [self.b['user']['id']]})
        self.assertEqual(posted['report']['net'],None)
        self.assertNotIn('note',posted['report'])
        self.assertIsInstance(posted['created'],int)
        rid = posted['id']
        seen = self.call(self.b, 'GET', '/v1/reports')['reports']
        self.assertEqual(len(seen), 1)
        serialized = json.dumps(seen)
        for private in ('PRIVATE', 'SECRET', '12345', '私人分类'):
            self.assertNotIn(private, serialized)
        self.assertEqual(self.call(self.c, 'GET', '/v1/reports')['reports'], [])
        with self.assertRaises(APIError):
            self.call(self.c, 'POST', '/v1/reports/' + rid + '/cheer', {'kind': '为你加油'})
        with self.assertRaises(APIError):
            self.call(self.b, 'DELETE', '/v1/reports/' + rid)
        self.call(self.b, 'POST', '/v1/reports/' + rid + '/cheer', {'kind': '为你加油'})
        self.assertEqual(self.call(self.a, 'GET', '/v1/reports')['reports'][0]['cheers'][0]['nickname'], '小周')
        self.call(self.a, 'DELETE', '/v1/friends/' + self.b['user']['id'])
        self.assertEqual(self.call(self.b, 'GET', '/v1/reports')['reports'], [])
        self.friend(self.a, self.b)
        self.assertEqual(self.call(self.b, 'GET', '/v1/reports')['reports'], [])
        self.call(self.a, 'POST', '/v1/reports', {'report': self.report, 'recipients': [self.b['user']['id']]})
        self.call(self.a, 'DELETE', '/v1/reports/' + rid)
        self.assertEqual(self.call(self.b, 'GET', '/v1/reports')['reports'], [])

    def test_replace_audience(self):
        self.friend(self.a, self.b)
        self.friend(self.a, self.c)
        post = {'report': self.report, 'recipients': [self.b['user']['id']]}
        rid = self.call(self.a, 'POST', '/v1/reports', post)['id']
        post['report'] = dict(self.report, hideAmounts=False, hideCategories=False)
        post['recipients'] = [self.c['user']['id']]
        self.assertEqual(self.call(self.a, 'POST', '/v1/reports', post)['id'], rid)
        self.assertEqual(self.call(self.b, 'GET', '/v1/reports')['reports'], [])
        self.assertEqual(self.call(self.c, 'GET', '/v1/reports')['reports'][0]['report']['income'], 12345)

    def test_auth_and_recovery(self):
        with self.assertRaises(APIError):
            self.service.handle('POST', '/v1/auth/register', dict(username='bad', nickname='坏', password='long-secret-password', enrollment='wrong'))
        with self.assertRaises(APIError):
            self.service.handle('POST', '/v1/auth/login', dict(username='alice', password='wrong-password'))
        result = self.service.handle('POST', '/v1/auth/recover', dict(username='alice', password='new-long-secret', recoveryCode=self.a['recoveryCode']))
        with self.assertRaises(APIError):
            self.call(self.a, 'GET', '/v1/me')
        with self.assertRaises(APIError):
            self.service.handle('POST', '/v1/auth/recover', dict(username='alice', password='new-long-secret', recoveryCode=self.a['recoveryCode']))
        self.assertEqual(self.call(result, 'GET', '/v1/me')['user']['nickname'], '小林')
        self.call(result, 'POST', '/v1/auth/logout')
        with self.assertRaises(APIError):
            self.call(result, 'GET', '/v1/me')

    def test_invite_and_requests(self):
        with self.assertRaises(APIError):
            self.call(self.a, 'POST', '/v1/requests', {'code': self.a['user']['inviteCode']})
        self.call(self.a, 'POST', '/v1/requests', {'code': self.b['user']['inviteCode']})
        request = self.call(self.b, 'GET', '/v1/requests')['incoming'][0]
        with self.assertRaises(APIError):
            self.call(self.c, 'POST', '/v1/requests/' + request['id'])
        self.call(self.b, 'DELETE', '/v1/requests/' + request['id'])
        self.assertEqual(self.call(self.a, 'GET', '/v1/requests')['outgoing'], [])
        self.call(self.b, 'POST', '/v1/invite/rotate')
        with self.assertRaises(APIError):
            self.call(self.a, 'POST', '/v1/requests', {'code': self.b['user']['inviteCode']})

    def test_persistence_and_http(self):
        reopened = Service(self.service.db_path, 'private-enrollment-code')
        self.assertEqual(reopened.handle('GET', '/v1/me', {}, self.a['token'])['user']['username'], 'alice')
        server = make_server(reopened, port=0, origins=['https://localhost'])
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        try:
            request = urllib.request.Request(base + '/v1/me', headers={'Authorization': 'Bearer ' + self.a['token'], 'Origin': 'https://localhost'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://localhost')
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
            with self.assertRaises(urllib.error.HTTPError) as failure:
                urllib.request.urlopen(urllib.request.Request(base + '/v1/me', headers={'Origin': 'https://evil.example'}))
            self.assertEqual(failure.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()

    def test_validation_and_limit(self):
        for change in ({'through': '2099-01-01'}, {'start': '2026-10-06'}, {'recordedDays': 8}, {'income': float('nan'), 'hideAmounts': False}, {'hideAmounts': 'yes'}, {'categories': [{'name': 'a', 'percent': 101}]}):
            with self.assertRaises(APIError):
                clean_report(dict(self.report, **change))
        for _ in range(2):
            self.service.limit('test', 2, 60)
        with self.assertRaises(APIError) as failure:
            self.service.limit('test', 2, 60)
        self.assertEqual(failure.exception.status, 429)


if __name__ == '__main__':
    unittest.main()
