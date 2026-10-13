import base64,datetime as dt,json,os,tempfile,unittest
from unittest.mock import patch
from app import Service,APIError

class FeatureTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=Service(os.path.join(self.tmp.name,'db'),'test-enrollment')
        self.a=self.register('alice');self.b=self.register('bob');self.c=self.register('carol');self.friend(self.a,self.b)
    def tearDown(self):self.tmp.cleanup()
    def register(self,name):return self.s.handle('POST','/v1/auth/register',dict(username=name,nickname=name,password='long-secret-password',enrollment='test-enrollment'))
    def call(self,u,m,p,b=None):return self.s.handle(m,p,b or {},u['token'])
    def friend(self,a,b):
        self.call(a,'POST','/v1/requests',{'code':b['user']['inviteCode']});rid=self.call(b,'GET','/v1/requests')['incoming'][0]['id'];self.call(b,'POST','/v1/requests/'+rid)
    def test_cloud_owner_cipher_and_conflict(self):
        blob=json.dumps(dict(format='jianji-backup',version=1,salt=base64.b64encode(b'x'*16).decode(),iv=base64.b64encode(b'y'*12).decode(),payload=base64.b64encode(b'opaque-ciphertext'*3).decode()))
        first=self.call(self.a,'POST','/v1/cloud',{'blob':blob,'expected':0});self.assertEqual(first['version'],1)
        self.assertNotIn('blob',self.call(self.a,'GET','/v1/cloud'))
        self.assertEqual(self.call(self.a,'GET','/v1/cloud/content')['blob'],blob)
        self.assertFalse(self.call(self.b,'GET','/v1/cloud')['present'])
        with self.assertRaises(APIError):self.call(self.b,'GET','/v1/cloud/content')
        with self.assertRaises(APIError):self.call(self.a,'POST','/v1/cloud',{'blob':blob,'expected':0})
        with self.assertRaises(APIError):self.call(self.a,'POST','/v1/cloud',{'blob':'{"entries":[]}','expected':1})
        self.call(self.a,'DELETE','/v1/cloud',{'expected':1});self.assertFalse(self.call(self.a,'GET','/v1/cloud')['present'])
        self.assertEqual(self.call(self.a,'GET','/v1/cloud')['version'],2)
        with self.assertRaises(APIError):self.call(self.a,'POST','/v1/cloud',{'blob':blob,'expected':1})
        self.assertEqual(self.call(self.a,'POST','/v1/cloud',{'blob':blob,'expected':2})['version'],3)
    def test_challenge_opt_in_dates_and_ranking(self):
        start=dt.date(2026,10,13)
        with patch('features.today',return_value=start):
            cid=self.call(self.a,'POST','/v1/challenges',dict(title='七天挑战',start=start.isoformat(),mode='streak7',friends=[self.b['user']['id']]))['id']
            invited=self.call(self.b,'GET','/v1/challenges')['challenges'][0];self.assertEqual(invited['members'],[])
            with self.assertRaises(APIError):self.call(self.b,'POST','/v1/challenges/'+cid+'/checkin',{'day':start.isoformat()})
            self.call(self.b,'POST','/v1/challenges/'+cid+'/join')
            with self.assertRaises(APIError):self.call(self.c,'POST','/v1/challenges/'+cid+'/join')
            with self.assertRaises(APIError):self.call(self.a,'POST','/v1/challenges/'+cid+'/checkin',{'day':'2026-10-12'})
            for user in (self.a,self.b):
                for _ in range(2):self.call(user,'POST','/v1/challenges/'+cid+'/checkin',{'day':start.isoformat()})
            scores=self.call(self.a,'GET','/v1/challenges')['challenges'][0]['members'];self.assertEqual([m['rank'] for m in scores],[1,1]);self.assertEqual(scores[0]['days'],1)
        with patch('features.today',return_value=start+dt.timedelta(days=1)):
            self.call(self.a,'POST','/v1/challenges/'+cid+'/checkin',{'day':'2026-10-14'})
            scores=self.call(self.a,'GET','/v1/challenges')['challenges'][0]['members'];self.assertEqual(scores[0]['score'],2)
            self.call(self.a,'DELETE','/v1/friends/'+self.b['user']['id']);self.assertEqual(self.call(self.b,'GET','/v1/challenges')['challenges'],[])
    def test_aa_acceptance_partial_and_private_access(self):
        bill=dict(title='聚餐',date='2026-10-13',totalCents=10001,payer='me',parts=[dict(id='me',name='私人备注',self=True,cents=5001),dict(id='bob',name='秘密备注',friendId=self.b['user']['id'],cents=5000)])
        body=dict(localId='local-1',bill=bill,recipients=[self.b['user']['id']])
        bid=self.call(self.a,'POST','/v1/aa',body)['id'];self.assertEqual(self.call(self.a,'POST','/v1/aa',body)['id'],bid)
        invited=self.call(self.b,'GET','/v1/aa')['bills'][0];self.assertNotIn('parts',invited['bill'])
        with self.assertRaises(APIError):self.call(self.b,'POST','/v1/aa/'+bid+'/payments',dict(part='bob',cents=2000,clientId='a'*32))
        with self.assertRaises(APIError):self.call(self.c,'POST','/v1/aa/'+bid+'/join')
        self.call(self.b,'POST','/v1/aa/'+bid+'/join')
        shared=self.call(self.b,'GET','/v1/aa')['bills'][0];self.assertEqual(shared['bill']['parts'][1]['name'],'bob')
        paid=self.call(self.b,'POST','/v1/aa/'+bid+'/payments',dict(part='bob',cents=2000,clientId='a'*32))['id']
        self.assertEqual(self.call(self.b,'POST','/v1/aa/'+bid+'/payments',dict(part='bob',cents=2000,clientId='a'*32))['id'],paid)
        with self.assertRaises(APIError):self.call(self.b,'PATCH','/v1/aa/'+bid+'/payments/'+paid,{'state':'confirmed'})
        self.call(self.a,'PATCH','/v1/aa/'+bid+'/payments/'+paid,{'state':'confirmed'})
        with self.assertRaises(APIError):self.call(self.b,'POST','/v1/aa/'+bid+'/payments',dict(part='bob',cents=3001,clientId='b'*32))
        self.call(self.a,'POST','/v1/aa/'+bid+'/payments',dict(part='bob',cents=3000,clientId='c'*32))
        self.assertEqual(sum(p['cents'] for p in self.call(self.a,'GET','/v1/aa')['bills'][0]['payments']),5000)
        self.call(self.a,'DELETE','/v1/aa/'+bid);self.assertTrue(self.call(self.b,'GET','/v1/aa')['bills'][0]['closed'])
        with self.assertRaises(APIError):self.call(self.b,'POST','/v1/aa/'+bid+'/payments',dict(part='bob',cents=1,clientId='d'*32))

if __name__=='__main__':unittest.main()
