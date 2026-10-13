"""Private cloud backups, opt-in challenges and shared AA bills."""
import base64
import datetime as dt
import json
import re
import secrets
import time

CLOUD_LIMIT=20*1024*1024

def install(db):
    db.executescript('''
      CREATE TABLE IF NOT EXISTS cloud_backups(user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, blob TEXT NOT NULL, version INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, mode TEXT NOT NULL, target INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS challenge_members(challenge TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE, user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, state TEXT NOT NULL, PRIMARY KEY(challenge,user));
      CREATE TABLE IF NOT EXISTS checkins(challenge TEXT NOT NULL, user TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(challenge,user,day), FOREIGN KEY(challenge,user) REFERENCES challenge_members(challenge,user) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS aa_bills(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, local TEXT NOT NULL, payload TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, UNIQUE(owner,local));
      CREATE TABLE IF NOT EXISTS aa_members(bill TEXT NOT NULL REFERENCES aa_bills(id) ON DELETE CASCADE, user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, state TEXT NOT NULL, PRIMARY KEY(bill,user));
      CREATE TABLE IF NOT EXISTS aa_payments(id TEXT PRIMARY KEY, bill TEXT NOT NULL REFERENCES aa_bills(id) ON DELETE CASCADE, part TEXT NOT NULL, cents INTEGER NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL, client TEXT NOT NULL, actor TEXT NOT NULL, UNIQUE(bill,client));
    ''')

def today():return (dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=8)).date()

def friend_removed(db,a,b):
    for owner,other in ((a,b),(b,a)):
        db.execute('DELETE FROM challenge_members WHERE user=? AND challenge IN (SELECT id FROM challenges WHERE owner=?)',(other,owner))
        db.execute('DELETE FROM aa_members WHERE user=? AND bill IN (SELECT id FROM aa_bills WHERE owner=?)',(other,owner))

def dispatch(service,db,uid,method,path,body,error,text,date):
    def fail(status,message):raise error(status,message)
    def integer(value,minimum,maximum):
        if type(value) is not int or not minimum<=value<=maximum:fail(400,'金额或数量无效')
        return value
    def member(table,key,identifier):return db.execute(f'SELECT state FROM {table} WHERE {key}=? AND user=?',(identifier,uid)).fetchone()
    def cloud_meta(row):
        size=(row['size'] if 'size' in row.keys() else len(row['blob'])) if row else 0
        return dict(present=bool(size),version=row['version'] if row else 0,created=row['created'] if size else None,size=size)
    if path in ('/v1/cloud','/v1/cloud/content'):
        row=db.execute('SELECT '+('user,version,created,length(blob) size' if method=='GET' and not path.endswith('/content') else '*')+' FROM cloud_backups WHERE user=?',(uid,)).fetchone()
        if method=='GET':
            if path.endswith('/content'):
                if not row or not row['blob']:fail(404,'还没有云端备份')
                return dict(cloud_meta(row),blob=row['blob'])
            return cloud_meta(row)
        if path.endswith('/content'):fail(404,'接口不存在')
        service.limit(('cloud',uid),12,3600)
        expected=integer(body.get('expected'),0,1000000000)
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT * FROM cloud_backups WHERE user=?',(uid,)).fetchone()
        if expected!=(row['version'] if row else 0):fail(409,'云端备份已被另一设备更新，请刷新后再决定是否替换')
        if method=='DELETE':
            db.execute('INSERT INTO cloud_backups VALUES (?,?,?,?) ON CONFLICT(user) DO UPDATE SET blob=excluded.blob,version=excluded.version,created=excluded.created',(uid,'',expected+1,int(time.time())));return {'ok':True,'version':expected+1}
        if method!='POST':fail(404,'接口不存在')
        blob=body.get('blob')
        if not isinstance(blob,str) or len(blob)>CLOUD_LIMIT:fail(413,'云备份最大 20 MB，请减少照片或使用本机备份')
        try:
            v=json.loads(blob)
            assert set(v)=={'format','version','salt','iv','payload'} and v['format']=='jianji-backup' and v['version']==1
            assert len(base64.b64decode(v['salt'],validate=True))==16 and len(base64.b64decode(v['iv'],validate=True))==12
            assert len(base64.b64decode(v['payload'],validate=True))>=16
        except Exception:fail(400,'请上传手机端加密后的简记备份')
        created=int(time.time())
        db.execute('INSERT INTO cloud_backups VALUES (?,?,?,?) ON CONFLICT(user) DO UPDATE SET blob=excluded.blob,version=excluded.version,created=excluded.created',(uid,blob,expected+1,created))
        return {'present':True,'version':expected+1,'created':created,'size':len(blob)}
    if path=='/v1/challenges' and method=='POST':
        service.limit(('challenge-create',uid),5,86400)
        title=text(body.get('title'),40);start=date(body.get('start'));mode=body.get('mode')
        if mode not in ('streak7','days20'):fail(400,'请选择挑战类型')
        if not today()<=start<=today()+dt.timedelta(days=14):fail(400,'挑战开始日期应为今天至未来 14 天')
        target,duration=(7,7) if mode=='streak7' else (20,30)
        audience=body.get('friends',[])
        if not isinstance(audience,list) or len(audience)>20 or any(not isinstance(v,str) for v in audience):fail(400,'参与好友无效')
        db.execute('BEGIN IMMEDIATE')
        if any(not service.is_friend(db,uid,v) for v in audience):fail(403,'只能邀请当前好友')
        cid=secrets.token_hex(16)
        db.execute('INSERT INTO challenges VALUES (?,?,?,?,?,?,?)',(cid,uid,title,mode,target,start.isoformat(),(start+dt.timedelta(days=duration-1)).isoformat()))
        db.execute('INSERT INTO challenge_members VALUES (?,?,?)',(cid,uid,'joined'))
        db.executemany('INSERT INTO challenge_members VALUES (?,?,?)',[(cid,v,'invited') for v in sorted(set(audience))])
        return {'id':cid}
    if path=='/v1/challenges' and method=='GET':
        rows=db.execute('SELECT c.*,m.state,u.nickname FROM challenges c JOIN challenge_members m ON m.challenge=c.id JOIN users u ON u.id=c.owner WHERE m.user=? ORDER BY c.start DESC',(uid,)).fetchall()
        values=[]
        for c in rows:
            if c['owner']!=uid and not service.is_friend(db,uid,c['owner']):continue
            item=dict(c);item['members']=[]
            if c['state']=='joined':
                people=db.execute("SELECT m.user,u.nickname FROM challenge_members m JOIN users u ON u.id=m.user WHERE m.challenge=? AND m.state='joined'",(c['id'],)).fetchall()
                scored=[]
                for person in people:
                    days=[r[0] for r in db.execute('SELECT day FROM checkins WHERE challenge=? AND user=? ORDER BY day',(c['id'],person['user']))]
                    longest=current=0;prior=None
                    for d in days:
                        day=date(d);current=current+1 if prior and day-prior==dt.timedelta(days=1) else 1;longest=max(longest,current);prior=day
                    score=longest if c['mode']=='streak7' else len(days)
                    scored.append(dict(person,days=len(days),score=score,percent=min(100,round(score/c['target']*100))))
                scored.sort(key=lambda p:(-p['score'],p['nickname'],p['user']))
                rank=0;last=None
                for i,p in enumerate(scored):
                    if p['score']!=last:rank=i+1;last=p['score']
                    p['rank']=rank
                item['members']=scored
            item['active']=c['start']<=today().isoformat()<=c['end'];values.append(item)
        return {'challenges':values}
    match=re.fullmatch(r'/v1/challenges/([a-f0-9]{32})(/join|/checkin|/leave)?',path)
    if match:
        cid,action=match.groups();db.execute('BEGIN IMMEDIATE')
        c=db.execute('SELECT * FROM challenges WHERE id=?',(cid,)).fetchone();m=member('challenge_members','challenge',cid)
        if not c or not m or (c['owner']!=uid and not service.is_friend(db,uid,c['owner'])):fail(404,'挑战不存在或你没有查看权限')
        if action=='/join' and method=='POST':
            if today().isoformat()>c['start']:fail(400,'挑战已经开始，不能在中途加入')
            db.execute("UPDATE challenge_members SET state='joined' WHERE challenge=? AND user=?",(cid,uid));return {'ok':True}
        if action=='/checkin' and method=='POST':
            if m['state']!='joined':fail(403,'请先确认参加挑战')
            day=date(body.get('day'))
            if day!=today() or not c['start']<=day.isoformat()<=c['end']:fail(400,'只能记录挑战期间的当天，不能补填或预填')
            db.execute('INSERT OR IGNORE INTO checkins VALUES (?,?,?)',(cid,uid,day.isoformat()));return {'ok':True}
        if action=='/leave' and method=='DELETE':
            if c['owner']==uid:fail(400,'发起人请使用撤回挑战')
            db.execute('DELETE FROM challenge_members WHERE challenge=? AND user=?',(cid,uid));return {'ok':True}
        if not action and method=='DELETE' and c['owner']==uid:
            db.execute('DELETE FROM challenges WHERE id=?',(cid,));return {'ok':True}
        fail(403,'无权执行此操作')
    if path=='/v1/aa' and method=='POST':
        service.limit(('aa-create',uid),20,86400)
        local=text(body.get('localId'),64);source=body.get('bill')
        if not isinstance(source,dict):fail(400,'分摊格式无效')
        parts=source.get('parts');total=integer(source.get('totalCents'),1,1000000000)
        if not isinstance(parts,list) or not 2<=len(parts)<=20:fail(400,'分摊需要 2 至 20 人')
        result={'title':text(source.get('title'),40),'date':date(source.get('date')).isoformat(),'totalCents':total,'payer':text(source.get('payer'),64),'parts':[]}
        ids=set();friends=set()
        for part in parts:
            if not isinstance(part,dict):fail(400,'参与人无效')
            pid=text(part.get('id'),64);fid=part.get('friendId') or ''
            if not isinstance(fid,str) or pid in ids:fail(400,'参与人不能重复')
            ids.add(pid)
            if part.get('self') is True:fid=uid
            name=text(part.get('name'),40)
            if fid:
                if fid in friends:fail(400,'同一好友不能分配到两个人')
                if fid!=uid and not service.is_friend(db,uid,fid):fail(403,'在线分摊只能关联当前好友')
                person=db.execute('SELECT nickname FROM users WHERE id=?',(fid,)).fetchone();name=person['nickname'];friends.add(fid)
            result['parts'].append({'id':pid,'name':name,'friendId':fid,'cents':integer(part.get('cents'),0,total)})
        if result['payer'] not in ids or sum(p['cents'] for p in result['parts'])!=total:fail(400,'每人应付合计必须等于总额')
        audience=body.get('recipients')
        if not isinstance(audience,list) or not audience or any(not isinstance(v,str) or v==uid or v not in friends for v in audience):fail(400,'请选择已关联的好友接收分摊单')
        encoded=json.dumps(result,ensure_ascii=False);db.execute('BEGIN IMMEDIATE')
        if any(not service.is_friend(db,uid,v) for v in friends if v!=uid):fail(403,'好友关系已变动')
        existing=db.execute('SELECT * FROM aa_bills WHERE owner=? AND local=?',(uid,local)).fetchone()
        if existing:
            old=[r[0] for r in db.execute('SELECT user FROM aa_members WHERE bill=?',(existing['id'],))]
            if existing['closed'] or existing['payload']!=encoded or sorted(old)!=sorted(set(audience)):fail(409,'已分享的分摊单不能修改，请撤回后新建')
            return {'id':existing['id']}
        bid=secrets.token_hex(16);db.execute('INSERT INTO aa_bills VALUES (?,?,?,?,?,?)',(bid,uid,local,encoded,0,int(time.time())))
        db.executemany('INSERT INTO aa_members VALUES (?,?,?)',[(bid,v,'invited') for v in sorted(set(audience))]);return {'id':bid}
    if path=='/v1/aa' and method=='GET':
        rows=db.execute('SELECT b.*,u.nickname FROM aa_bills b JOIN users u ON u.id=b.owner WHERE b.owner=? OR EXISTS(SELECT 1 FROM aa_members m WHERE m.bill=b.id AND m.user=?) ORDER BY b.created DESC LIMIT 100',(uid,uid)).fetchall();values=[]
        for row in rows:
            own=row['owner']==uid;m=member('aa_members','bill',row['id'])
            if not own and (not m or not service.is_friend(db,uid,row['owner'])):continue
            item={'id':row['id'],'own':own,'owner':row['owner'],'nickname':row['nickname'],'closed':bool(row['closed']),'state':'owner' if own else m['state'],'localId':row['local'] if own else None}
            payload=json.loads(row['payload'])
            if row['closed'] and not own:item['bill']={'title':payload['title'],'date':payload['date']};item['payments']=[]
            elif not own and m['state']!='joined':
                mine=next((p for p in payload['parts'] if p['friendId']==uid),None)
                item['bill']={'title':payload['title'],'date':payload['date'],'totalCents':payload['totalCents'],'ownCents':mine['cents'] if mine else 0};item['payments']=[]
            else:
                item['bill']=payload;item['payments']=[dict(r) for r in db.execute('SELECT * FROM aa_payments WHERE bill=? ORDER BY created,id',(row['id'],))]
            values.append(item)
        return {'bills':values}
    match=re.fullmatch(r'/v1/aa/([a-f0-9]{32})(/join|/payments|/payments/([a-f0-9]{32}))?',path)
    if match:
        bid,action,payment=match.groups();db.execute('BEGIN IMMEDIATE')
        b=db.execute('SELECT * FROM aa_bills WHERE id=?',(bid,)).fetchone();m=member('aa_members','bill',bid)
        if not b or (b['owner']!=uid and (not m or not service.is_friend(db,uid,b['owner']))):fail(404,'分摊单不存在或没有权限')
        if method=='DELETE' and not action and b['owner']==uid:
            db.execute('UPDATE aa_bills SET closed=1 WHERE id=?',(bid,));return {'ok':True}
        if b['closed']:fail(400,'分摊单已撤回')
        if action=='/join' and method=='POST':
            if m:db.execute("UPDATE aa_members SET state='joined' WHERE bill=? AND user=?",(bid,uid))
            return {'ok':True}
        if b['owner']!=uid and m['state']!='joined':fail(403,'请先确认接收分摊单')
        payload=json.loads(b['payload'])
        if action=='/payments' and method=='POST':
            pid=text(body.get('part'),64);part=next((p for p in payload['parts'] if p['id']==pid),None)
            if not part or pid==payload['payer']:fail(400,'垫付人不需要向自己结算')
            if uid!=b['owner'] and part['friendId']!=uid:fail(403,'只能提交自己的结算')
            cents=integer(body.get('cents'),1,1000000000)
            client=text(body.get('clientId'),32,32)
            if not re.fullmatch('[a-f0-9]{32}',client):fail(400,'结算标识无效')
            existing=db.execute('SELECT * FROM aa_payments WHERE bill=? AND client=?',(bid,client)).fetchone()
            if existing:
                if existing['actor']!=uid or existing['part']!=pid or existing['cents']!=cents:fail(409,'结算标识已使用')
                return {'ok':True,'id':existing['id']}
            used=db.execute("SELECT coalesce(sum(cents),0) FROM aa_payments WHERE bill=? AND part=? AND state IN ('pending','confirmed')",(bid,pid)).fetchone()[0]
            if used+cents>part['cents']:fail(400,'结算金额超过尚未结清金额')
            pay=secrets.token_hex(16);state='confirmed' if uid==b['owner'] else 'pending'
            db.execute('INSERT INTO aa_payments VALUES (?,?,?,?,?,?,?,?)',(pay,bid,pid,cents,state,int(time.time()),client,uid));return {'ok':True,'id':pay}
        if payment and method=='PATCH':
            if uid!=b['owner']:fail(403,'由发起人核对并确认结算')
            state=body.get('state')
            if state not in ('confirmed','rejected'):fail(400,'请选择确认或拒绝')
            changed=db.execute("UPDATE aa_payments SET state=? WHERE id=? AND bill=? AND state='pending'",(state,payment,bid)).rowcount
            if not changed:fail(409,'这笔申请已处理或不存在')
            return {'ok':True}
        fail(403,'无权执行此操作')
    return None
