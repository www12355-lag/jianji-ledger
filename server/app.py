"""Jianji friends API. Python 3.11+, standard library; bind behind HTTPS proxy."""
import contextlib
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import features


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(value, salt=None):
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', value.encode(), bytes.fromhex(salt), 600000).hex()
    return salt + ':' + hashed


def password_ok(value, saved):
    return hmac.compare_digest(password_hash(value, saved.split(':')[0]), saved)


def text(value, maximum, minimum=1):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise APIError(400, '请检查填写内容的长度')
    value = value.strip()
    if any(ord(c) < 32 for c in value):
        raise APIError(400, '内容含有无效字符')
    return value


def password(value):
    if not isinstance(value, str) or not 10 <= len(value) <= 128:
        raise APIError(400, '密码需为 10 至 128 位')
    return value


def date(value):
    try:
        parsed = dt.date.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError()
        return parsed
    except (ValueError, TypeError):
        raise APIError(400, '日期无效')


def clean_report(value):
    """Whitelist and erase hidden values on the server as well as the client."""
    if not isinstance(value, dict):
        raise APIError(400, '汇总格式无效')
    mode = value.get('mode')
    if mode not in ('day', 'week', 'month'):
        raise APIError(400, '请选择日报、周报或月报')
    start, end, through = (date(value.get(k)) for k in ('start', 'end', 'through'))
    today = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)).date()
    if not start <= through <= min(end, today):
        raise APIError(400, '汇总日期范围无效')
    if mode == 'day' and start != end:
        raise APIError(400, '日报日期范围无效')
    if mode == 'week' and (start.weekday() != 0 or end - start != dt.timedelta(days=6)):
        raise APIError(400, '周报需为周一至周日')
    if mode == 'month' and (start.day != 1 or end != (start.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)):
        raise APIError(400, '月报需为自然月')
    hide_amounts, hide_categories = value.get('hideAmounts'), value.get('hideCategories')
    if type(hide_amounts) is not bool or type(hide_categories) is not bool:
        raise APIError(400, '请选择分享隐私选项')
    result = dict(mode=mode, start=start.isoformat(), end=end.isoformat(), through=through.isoformat(),
                  hideAmounts=hide_amounts, hideCategories=hide_categories)
    for key in ('count', 'recordedDays'):
        number = value.get(key)
        if type(number) is not int or not 0 <= number <= 1000000:
            raise APIError(400, '记账统计无效')
        result[key] = number
    if result['recordedDays'] > (through - start).days + 1 or result['recordedDays'] > result['count']:
        raise APIError(400, '记账天数无效')
    for key in ('income', 'net', 'balance'):
        amount = value.get(key)
        if not hide_amounts and (type(amount) not in (int, float) or not -1e10 <= amount <= 1e10):
            raise APIError(400, '汇总金额无效')
        result[key] = None if hide_amounts else round(amount, 2)
    categories = value.get('categories', [])
    if not isinstance(categories, list) or len(categories) > 100:
        raise APIError(400, '分类汇总无效')
    result['categories'] = []
    for item in categories:
        if not isinstance(item, dict) or type(item.get('percent')) not in (int, float) or not 0 <= item['percent'] <= 100:
            raise APIError(400, '分类占比无效')
        result['categories'].append({'name': '分类 ' + str(len(result['categories']) + 1) if hide_categories else text(item.get('name'), 24),
                                     'percent': round(item['percent'], 1)})
    budget = value.get('budget')
    result['budget'] = None
    if budget is not None:
        if mode != 'month' or not isinstance(budget, dict) or type(budget.get('percent')) not in (int, float) or not 0 <= budget['percent'] <= 10000:
            raise APIError(400, '预算进度无效')
        result['budget'] = {'percent': round(budget['percent'], 1)}
    return result


class Service:
    def __init__(self, db_path, enrollment, max_users=20):
        if not isinstance(enrollment, str) or not 6 <= len(enrollment) <= 100:
            raise ValueError('A private enrollment code is required')
        self.db_path, self.enrollment, self.max_users = db_path, enrollment, max_users
        self.rates, self.rate_lock = {}, threading.Lock()
        with self.db() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS users (
                  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL,
                  password TEXT NOT NULL, recovery TEXT NOT NULL, invite TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                  token TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS friends (
                  a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(a,b), CHECK(a<b));
                CREATE TABLE IF NOT EXISTS requests (
                  id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  receiver TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL,
                  UNIQUE(sender,receiver), CHECK(sender<>receiver));
                CREATE TABLE IF NOT EXISTS reports (
                  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  mode TEXT NOT NULL, start TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL,
                  UNIQUE(owner,mode,start));
                CREATE TABLE IF NOT EXISTS recipients (
                  report TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                  user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(report,user));
                CREATE TABLE IF NOT EXISTS cheers (
                  report TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                  user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, PRIMARY KEY(report,user));
                CREATE TABLE IF NOT EXISTS profiles (
                  user TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, bio TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT 'purple');
                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  receiver TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL,
                  client TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(sender,client));
                CREATE INDEX IF NOT EXISTS message_pair ON messages(sender,receiver,id);
                CREATE TABLE IF NOT EXISTS conversation_reads (
                  user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, friend TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  last INTEGER NOT NULL, PRIMARY KEY(user,friend));
                CREATE TABLE IF NOT EXISTS friend_notes (
                  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, friend TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  remark TEXT NOT NULL, PRIMARY KEY(owner,friend));
            ''')
            features.install(db)

    @contextlib.contextmanager
    def db(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA busy_timeout=10000')
        try:
            with db:
                yield db
        finally:
            db.close()

    def limit(self, key, maximum, seconds):
        now = time.time()
        with self.rate_lock:
            if len(self.rates) > 10000:
                self.rates = {k: v for k, v in self.rates.items() if v[1] > now}
                if len(self.rates) > 10000:
                    raise APIError(429, '服务繁忙，请稍后再试')
            count, deadline = self.rates.get(key, (0, now + seconds))
            if deadline <= now:
                count, deadline = 0, now + seconds
            if count >= maximum:
                raise APIError(429, '操作较频繁，请稍后再试')
            self.rates[key] = (count + 1, deadline)

    @staticmethod
    def public_user(row):
        return {'id': row['id'], 'nickname': row['nickname']}

    def me(self, row):
        with self.db() as db:
            profile = db.execute('SELECT bio,avatar FROM profiles WHERE user=?', (row['id'],)).fetchone()
        return dict(self.public_user(row), username=row['username'], inviteCode=row['invite'],
                    bio=profile['bio'] if profile else '', avatar=profile['avatar'] if profile else 'purple')

    @staticmethod
    def friend_details(db, owner, other):
        row=db.execute("SELECT u.id,u.nickname,u.username,coalesce(p.avatar,'purple') avatar,coalesce(n.remark,'') remark FROM users u LEFT JOIN profiles p ON p.user=u.id LEFT JOIN friend_notes n ON n.owner=? AND n.friend=u.id WHERE u.id=?", (owner,other)).fetchone()
        return dict(row)

    def session(self, db, user):
        token = secrets.token_urlsafe(32)
        expires = int(time.time()) + 30 * 86400
        db.execute('DELETE FROM sessions WHERE expires<?', (int(time.time()),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (digest(token), user['id'], expires))
        # Limit forgotten devices to ten active sessions per account.
        db.execute('DELETE FROM sessions WHERE user=? AND token NOT IN (SELECT token FROM sessions WHERE user=? ORDER BY expires DESC LIMIT 10)', (user['id'], user['id']))
        return {'token': token, 'expires': expires, 'user': self.me(user)}

    @staticmethod
    def is_friend(db, a, b):
        a, b = sorted((a, b))
        return db.execute('SELECT 1 FROM friends WHERE a=? AND b=?', (a, b)).fetchone() is not None

    def handle(self, method, path, body, bearer='', ip='local'):
        self.limit(('all', ip), 300, 60)
        if method == 'GET' and path == '/health':
            return {'ok': True, 'service': 'jianji-friends', 'version': '2.5'}
        if not isinstance(body, dict):
            raise APIError(400, '请求格式无效')
        with self.db() as db:
            if path in ('/v1/auth/register', '/v1/auth/login', '/v1/auth/recover') and method == 'POST':
                self.limit(('auth', ip), 20, 900)
                username = text(body.get('username'), 24, 3).lower()
                if not re.fullmatch(r'[a-z0-9_]{3,24}', username):
                    raise APIError(400, '账号需为 3 至 24 位字母、数字或下划线')
                self.limit(('account', username), 15, 900)
                if path.endswith('register'):
                    if not hmac.compare_digest(digest(str(body.get('enrollment', ''))), digest(self.enrollment)):
                        raise APIError(403, '内测注册口令不正确')
                    nickname, secret = text(body.get('nickname'), 24), password(body.get('password'))
                    recovery = secrets.token_urlsafe(24)
                    hashed = password_hash(secret)
                    db.execute('BEGIN IMMEDIATE')
                    if db.execute('SELECT count(*) FROM users').fetchone()[0] >= self.max_users:
                        raise APIError(403, '内测账号名额已满，请联系管理员')
                    try:
                        uid = secrets.token_hex(16)
                        db.execute('INSERT INTO users VALUES (?,?,?,?,?,?,?)',
                                   (uid, username, nickname, hashed, digest(recovery), secrets.token_hex(6).upper(), int(time.time())))
                    except sqlite3.IntegrityError:
                        raise APIError(409, '账号已被使用，请换一个')
                    result = self.session(db, db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone())
                    result['recoveryCode'] = recovery
                    return result
                user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
                if path.endswith('recover'):
                    code, new_password = text(body.get('recoveryCode'), 100), password(body.get('password'))
                    if not user or not hmac.compare_digest(user['recovery'], digest(code)):
                        raise APIError(401, '账号或恢复码不正确')
                    new_code = secrets.token_urlsafe(24)
                    # Compare the recovery hash in the UPDATE to prevent concurrent replay.
                    changed = db.execute('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?',
                                         (password_hash(new_password), digest(new_code), user['id'], digest(code))).rowcount
                    if not changed:
                        raise APIError(401, '恢复码已使用，请使用最新恢复码')
                    db.execute('DELETE FROM sessions WHERE user=?', (user['id'],))
                    result = self.session(db, user)
                    result['recoveryCode'] = new_code
                    return result
                supplied = password(body.get('password'))
                # Same expensive work for unknown usernames, avoid timing-based enumeration.
                saved = user['password'] if user else '00' * 16 + ':' + '00' * 32
                if not password_ok(supplied, saved) or not user:
                    raise APIError(401, '账号或密码不正确')
                return self.session(db, user)

            token = digest(bearer)
            user = db.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?',
                              (token, int(time.time()))).fetchone()
            if not user:
                raise APIError(401, '登录已失效，请重新登录')
            uid = user['id']
            self.limit(('user', uid), 120, 60)
            extra=features.dispatch(self,db,uid,method,path,body,APIError,text,date)
            if extra is not None:return extra
            if method == 'GET' and path == '/v1/me':
                return {'user': self.me(user)}
            if method == 'POST' and path == '/v1/auth/logout':
                db.execute('DELETE FROM sessions WHERE token=?', (token,))
                return {'ok': True}
            if method == 'POST' and path == '/v1/invite/rotate':
                code = secrets.token_hex(6).upper()
                db.execute('UPDATE users SET invite=? WHERE id=?', (code, uid))
                return {'inviteCode': code}
            if method == 'PATCH' and path == '/v1/me':
                nickname = text(body.get('nickname'), 24)
                bio = text(body.get('bio', ''), 120, 0)
                avatar = body.get('avatar', 'purple')
                if avatar not in ('purple', 'mint', 'peach', 'blue'):
                    raise APIError(400, '请选择头像颜色')
                db.execute('UPDATE users SET nickname=? WHERE id=?', (nickname, uid))
                db.execute('INSERT INTO profiles VALUES (?,?,?) ON CONFLICT(user) DO UPDATE SET bio=excluded.bio,avatar=excluded.avatar', (uid, bio, avatar))
                return {'user': dict(self.public_user({'id':uid,'nickname':nickname}), username=user['username'],inviteCode=user['invite'],bio=bio,avatar=avatar)}
            if method == 'GET' and path == '/v1/conversations':
                friends = db.execute('SELECT u.id,u.nickname FROM users u JOIN friends f ON (f.a=u.id AND f.b=?) OR (f.b=u.id AND f.a=?)', (uid, uid)).fetchall()
                conversations = []
                for friend in friends:
                    other = friend['id']
                    last = db.execute('SELECT content,created,id FROM messages WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?) ORDER BY id DESC LIMIT 1', (uid,other,other,uid)).fetchone()
                    read = db.execute('SELECT last FROM conversation_reads WHERE user=? AND friend=?', (uid,other)).fetchone()
                    unread = db.execute('SELECT count(*) FROM messages WHERE sender=? AND receiver=? AND id>?', (other,uid,read['last'] if read else 0)).fetchone()[0]
                    conversations.append(dict(self.public_user(friend), last=dict(last) if last else None, unread=unread))
                return {'conversations': sorted(conversations, key=lambda c:c['last']['id'] if c['last'] else 0, reverse=True)}
            match = re.fullmatch(r'/v1/messages/([a-f0-9]{32})(?:/before/([1-9][0-9]{0,15}))?', path)
            if match and method in ('GET', 'POST'):
                other, before = match.groups()
                db.execute('BEGIN IMMEDIATE')
                if not self.is_friend(db, uid, other):
                    raise APIError(403, '只有当前好友可以查看和发送消息')
                if method == 'POST':
                    if before:
                        raise APIError(404, '接口不存在')
                    self.limit(('message',uid), 30, 60)
                    content = body.get('content')
                    if not isinstance(content,str) or not 1 <= len(content.strip()) <= 2000 or any(ord(c)<32 and c not in '\n\t' for c in content):
                        raise APIError(400, '消息需为 1 至 2000 字')
                    content = content.strip()
                    client = text(body.get('clientId'), 32, 32)
                    if not re.fullmatch('[a-f0-9]{32}',client):
                        raise APIError(400, '消息标识无效')
                    previous = db.execute('SELECT * FROM messages WHERE sender=? AND client=?', (uid,client)).fetchone()
                    if previous:
                        if previous['receiver'] != other or previous['content'] != content:
                            raise APIError(409, '消息标识已使用')
                        return {'message':dict(previous)}
                    cursor = db.execute('INSERT INTO messages(sender,receiver,content,client,created) VALUES (?,?,?,?,?)', (uid,other,content,client,int(time.time())))
                    return {'message':dict(db.execute('SELECT * FROM messages WHERE id=?',(cursor.lastrowid,)).fetchone())}
                rows = db.execute('SELECT id,sender,receiver,content,created,client FROM messages WHERE ((sender=? AND receiver=?) OR (sender=? AND receiver=?)) AND id<? ORDER BY id DESC LIMIT 51', (uid,other,other,uid,int(before) if before else 9223372036854775807)).fetchall()
                visible = rows[:50]
                if not before and visible:
                    newest = visible[0]['id']
                    db.execute('INSERT INTO conversation_reads VALUES (?,?,?) ON CONFLICT(user,friend) DO UPDATE SET last=max(last,excluded.last)', (uid,other,newest))
                return {'messages':[{k:r[k] for k in r.keys() if k!='client' or r['sender']==uid} for r in reversed(visible)], 'hasMore':len(rows)>50}
            if method == 'GET' and path == '/v1/friends':
                rows = db.execute('SELECT u.id,u.nickname FROM users u JOIN friends f ON (f.a=u.id AND f.b=?) OR (f.b=u.id AND f.a=?) ORDER BY u.nickname', (uid, uid))
                return {'friends': [self.friend_details(db,uid,row['id']) for row in rows]}
            if method == 'GET' and path == '/v1/requests':
                incoming = db.execute('SELECT r.id,u.nickname,r.created FROM requests r JOIN users u ON u.id=r.sender WHERE r.receiver=? ORDER BY r.created DESC', (uid,))
                outgoing = db.execute('SELECT r.id,u.nickname,r.created FROM requests r JOIN users u ON u.id=r.receiver WHERE r.sender=? ORDER BY r.created DESC', (uid,))
                return {'incoming': [dict(row) for row in incoming], 'outgoing': [dict(row) for row in outgoing]}
            if method == 'POST' and path == '/v1/requests':
                self.limit(('invite', uid), 20, 3600)
                code = text(body.get('code'), 12, 12).upper()
                target = db.execute('SELECT id,nickname FROM users WHERE invite=?', (code,)).fetchone()
                if not target:
                    raise APIError(404, '邀请码不存在或已更换')
                if target['id'] == uid:
                    raise APIError(400, '不能添加自己为好友')
                if self.is_friend(db, uid, target['id']):
                    raise APIError(409, '你们已经是好友了')
                if db.execute('SELECT 1 FROM requests WHERE sender=? AND receiver=?', (target['id'], uid)).fetchone():
                    raise APIError(409, '对方已向你发出申请，请在收到的申请中确认')
                try:
                    db.execute('INSERT INTO requests VALUES (?,?,?,?)', (secrets.token_hex(16), uid, target['id'], int(time.time())))
                except sqlite3.IntegrityError:
                    raise APIError(409, '申请已发出，请等待对方确认')
                return {'ok': True, 'nickname': target['nickname']}
            match = re.fullmatch(r'/v1/requests/([a-f0-9]{32})', path)
            if match and method in ('POST', 'DELETE'):
                request = db.execute('SELECT * FROM requests WHERE id=?', (match[1],)).fetchone()
                if not request or (request['receiver'] != uid and not (method == 'DELETE' and request['sender'] == uid)):
                    raise APIError(404, '申请不存在')
                if method == 'POST':
                    db.execute('INSERT OR IGNORE INTO friends VALUES (?,?)', tuple(sorted((request['sender'], uid))))
                db.execute('DELETE FROM requests WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)',
                           (request['sender'], request['receiver'], request['receiver'], request['sender']))
                return {'ok': True}
            match = re.fullmatch(r'/v1/friends/([a-f0-9]{32})', path)
            if match and method in ('GET','PATCH'):
                other=match[1]
                db.execute('BEGIN IMMEDIATE')
                if not self.is_friend(db,uid,other):
                    raise APIError(403,'只有当前好友可以查看资料或设置备注')
                if method=='PATCH':
                    remark=text(body.get('remark'),40,0)
                    db.execute('INSERT INTO friend_notes VALUES (?,?,?) ON CONFLICT(owner,friend) DO UPDATE SET remark=excluded.remark',(uid,other,remark))
                return {'friend':self.friend_details(db,uid,other)}
            if match and method == 'DELETE':
                other = match[1]
                if not self.is_friend(db, uid, other):
                    raise APIError(404, '好友不存在')
                db.execute('DELETE FROM friends WHERE a=? AND b=?', tuple(sorted((uid, other))))
                db.execute('DELETE FROM friend_notes WHERE (owner=? AND friend=?) OR (owner=? AND friend=?)',(uid,other,other,uid))
                features.friend_removed(db,uid,other)
                # Revoked grants must never reappear when users become friends again.
                db.execute('DELETE FROM recipients WHERE (user=? AND report IN (SELECT id FROM reports WHERE owner=?)) OR (user=? AND report IN (SELECT id FROM reports WHERE owner=?))', (uid, other, other, uid))
                db.execute('DELETE FROM cheers WHERE (user=? AND report IN (SELECT id FROM reports WHERE owner=?)) OR (user=? AND report IN (SELECT id FROM reports WHERE owner=?))', (uid, other, other, uid))
                return {'ok': True}
            if method == 'POST' and path == '/v1/reports':
                report = clean_report(body.get('report'))
                audience = body.get('recipients')
                if not isinstance(audience, list) or not 1 <= len(audience) <= 50 or any(not isinstance(item, str) for item in audience):
                    raise APIError(400, '请至少选择一位好友')
                audience = sorted(set(audience))
                db.execute('BEGIN IMMEDIATE')
                if any(not self.is_friend(db, uid, other) for other in audience):
                    raise APIError(403, '只能分享给当前好友，请刷新后重试')
                existing = db.execute('SELECT id FROM reports WHERE owner=? AND mode=? AND start=?', (uid, report['mode'], report['start'])).fetchone()
                rid = existing['id'] if existing else secrets.token_hex(16)
                created=int(time.time())
                db.execute('INSERT INTO reports VALUES (?,?,?,?,?,?) ON CONFLICT(owner,mode,start) DO UPDATE SET payload=excluded.payload,created=excluded.created',
                           (rid, uid, report['mode'], report['start'], json.dumps(report, ensure_ascii=False), created))
                db.execute('DELETE FROM recipients WHERE report=?', (rid,))
                db.executemany('INSERT INTO recipients VALUES (?,?)', [(rid, other) for other in audience])
                db.execute('DELETE FROM cheers WHERE report=?', (rid,))
                return {'ok': True, 'id': rid, 'created':created, 'report':report}
            if method == 'GET' and path == '/v1/reports':
                rows = db.execute('SELECT r.*,u.nickname FROM reports r JOIN users u ON u.id=r.owner WHERE r.owner=? OR (EXISTS(SELECT 1 FROM recipients x WHERE x.report=r.id AND x.user=?) AND EXISTS(SELECT 1 FROM friends f WHERE (f.a=? AND f.b=r.owner) OR (f.b=? AND f.a=r.owner))) ORDER BY r.created DESC,r.id LIMIT 100', (uid, uid, uid, uid))
                reports = []
                for row in rows:
                    own = row['owner'] == uid
                    item = {'id': row['id'], 'owner': self.public_user({'id': row['owner'], 'nickname': row['nickname']}),
                            'own': own, 'created': row['created'], 'report': json.loads(row['payload'])}
                    if own:
                        item['recipients'] = [dict(x) for x in db.execute('SELECT u.id,u.nickname FROM recipients x JOIN users u ON u.id=x.user WHERE x.report=?', (row['id'],))]
                    item['cheers'] = [dict(x) for x in db.execute('SELECT u.id,u.nickname,c.kind FROM cheers c JOIN users u ON u.id=c.user WHERE c.report=? AND (c.user=? OR ?=1)', (row['id'], uid, int(own)))]
                    reports.append(item)
                return {'reports': reports}
            match = re.fullmatch(r'/v1/reports/([a-f0-9]{32})(/cheer)?', path)
            if match:
                rid, cheer = match.groups()
                row = db.execute('SELECT owner FROM reports WHERE id=?', (rid,)).fetchone()
                if not row:
                    raise APIError(404, '分享已撤回或不存在')
                if not cheer and method == 'DELETE':
                    if row['owner'] != uid:
                        raise APIError(404, '分享不存在')
                    db.execute('DELETE FROM reports WHERE id=?', (rid,))
                    return {'ok': True}
                if cheer and method == 'POST':
                    if not self.is_friend(db, uid, row['owner']) or not db.execute('SELECT 1 FROM recipients WHERE report=? AND user=?', (rid, uid)).fetchone():
                        raise APIError(404, '分享已撤回或你没有查看权限')
                    kind = body.get('kind')
                    if kind not in ('一起稳住预算', '继续坚持记账', '为你加油', ''):
                        raise APIError(400, '请选择一种鼓励')
                    if kind:
                        db.execute('INSERT INTO cheers VALUES (?,?,?) ON CONFLICT(report,user) DO UPDATE SET kind=excluded.kind', (rid, uid, kind))
                    else:
                        db.execute('DELETE FROM cheers WHERE report=? AND user=?', (rid, uid))
                    return {'ok': True}
            raise APIError(404, '接口不存在')


class Handler(BaseHTTPRequestHandler):
    server_version = 'Jianji'
    protocol_version = 'HTTP/1.0'

    def log_message(self, fmt, *args):
        # Do not log credentials, bodies, IPs or request paths.
        pass

    def respond(self, status, value):
        payload = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        origin = self.headers.get('Origin')
        if origin in self.server.origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
            if self.command=='OPTIONS':self.send_header('Access-Control-Max-Age','600')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in self.server.origins:
            return self.respond(403, {'error': '来源不允许'})
        self.respond(200, {'ok': True})

    def dispatch(self):
        cloud_slot=False
        try:
            path=urlsplit(self.path).path
            origin = self.headers.get('Origin')
            if origin and origin not in self.server.origins:
                raise APIError(403, '来源不允许')
            length = int(self.headers.get('Content-Length', '0'))
            large=path=='/v1/cloud' and self.command=='POST'
            if length < 0 or length > (features.CLOUD_LIMIT+8192 if large else 32768):
                raise APIError(413, '请求过大')
            authorization = self.headers.get('Authorization', '')
            token = authorization[7:] if authorization.startswith('Bearer ') else ''
            if large or path=='/v1/cloud/content':
                with self.server.service.db() as db:
                    if not db.execute('SELECT 1 FROM sessions WHERE token=? AND expires>?',(digest(token),int(time.time()))).fetchone():raise APIError(401,'请先登录')
                cloud_slot=self.server.cloud_slots.acquire(blocking=False)
                if not cloud_slot:raise APIError(429,'备份服务繁忙，请稍后重试')
            self.connection.settimeout(90 if large else 10)
            body = json.loads(self.rfile.read(length)) if length else {}
            # X-Real-IP is trustworthy only from the loopback reverse proxy.
            ip = self.headers.get('X-Real-IP', self.client_address[0]) if self.client_address[0] == '127.0.0.1' else self.client_address[0]
            result = self.server.service.handle(self.command, path, body, token, ip)
            self.respond(200, result)
        except APIError as error:
            self.respond(error.status, {'error': error.message})
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {'error': '请求格式无效'})
        except (TimeoutError, OSError):
            self.close_connection = True
        except Exception:
            self.respond(500, {'error': '服务暂时不可用，请稍后重试'})
        finally:
            if cloud_slot:self.server.cloud_slots.release()

    do_GET = do_POST = do_PATCH = do_DELETE = dispatch


def make_server(service, host='127.0.0.1', port=8787, origins=()):
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.cloud_slots=threading.BoundedSemaphore(1)
    server.service, server.origins = service, set(origins)
    return server


if __name__ == '__main__':
    os.umask(0o077)
    config_path = os.environ.get('JIANJI_CONFIG', '/etc/jianji/config.json')
    with open(config_path, encoding='utf-8') as file:
        config = json.load(file)
    service = Service(config['database'], config['enrollment'], config.get('maxUsers', 20))
    make_server(service, origins=config['origins']).serve_forever()
