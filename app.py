"""
[ADDED] Flask Backend Application
Provides: auth, message storage, Pinecone RAG
"""
from flask import Flask, request, jsonify, session, make_response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
from dotenv import load_dotenv
from datetime import timedelta, datetime
import os
import secrets
import json

# Load env
load_dotenv()

app = Flask(__name__)

# Core config
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
fallbacks = os.environ.get('SECRET_KEY_FALLBACKS', '').strip()
if fallbacks:
    try:
        parsed = json.loads(fallbacks)
        if isinstance(parsed, str):
            parsed = [parsed]
        parsed = [k for k in parsed if isinstance(k, str) and k]
    except Exception:
        parsed = [k.strip() for k in fallbacks.split(',') if k.strip()]
    if parsed:
        app.config['SECRET_KEY_FALLBACKS'] = parsed

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///leetcode_assistant.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# CORS for extension + localhost
CORS(app, supports_credentials=True, origins=[
    'chrome-extension://*',
    'http://localhost',
    'http://localhost:*',
    'https://localhost',
    'https://localhost:*'
])

# DB
db = SQLAlchemy(app)

# Models
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    api_token = db.Column(db.String(64), unique=True, nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    messages = db.relationship('Message', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, raw):
        from werkzeug.security import generate_password_hash
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, raw)

    def ensure_token(self):
        if not self.api_token:
            self.api_token = secrets.token_urlsafe(32)
        return self.api_token

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'api_token': self.api_token
        }

class Message(db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)  # user/assistant
    content = db.Column(db.Text, nullable=False)
    problem_slug = db.Column(db.String(255), nullable=True, index=True)
    problem_id = db.Column(db.String(50), nullable=True)
    problem_url = db.Column(db.String(500), nullable=True)
    code_context = db.Column(db.Text, nullable=True)
    model_used = db.Column(db.String(100), nullable=True)
    embedding_id = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'role': self.role,
            'content': self.content,
            'problem_slug': self.problem_slug,
            'problem_id': self.problem_id,
            'problem_url': self.problem_url,
            'code_context': self.code_context,
            'model_used': self.model_used,
            'embedding_id': self.embedding_id,
            'created_at': self.created_at.isoformat()
        }

# Auth decorator
def login_required(f):
    @wraps(f)
    def _wrap(*args, **kwargs):
        if 'user_id' in session:
            return f(*args, **kwargs)
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            token = auth.split(' ', 1)[1]
            user = User.query.filter_by(api_token=token).first()
            if user:
                session['user_id'] = user.id
                return f(*args, **kwargs)
        return jsonify({'error': 'Authentication required'}), 401
    return _wrap

# Routes: auth
@app.post('/api/auth/register')
def register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    if not username or not email or not password:
        return jsonify({'error': 'Username, email, password required'}), 400
    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({'error': 'User exists'}), 409
    user = User(username=username, email=email, password_hash='')
    user.set_password(password)
    user.ensure_token()
    db.session.add(user)
    db.session.commit()
    session.permanent = True
    session['user_id'] = user.id
    return jsonify({'success': True, 'user': user.to_dict()}), 201

@app.post('/api/auth/login')
def login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = User.query.filter((User.username == username) | (User.email == username)).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401
    user.ensure_token()
    db.session.commit()
    session.permanent = True
    session['user_id'] = user.id
    return jsonify({'success': True, 'user': user.to_dict()}), 200

@app.post('/api/auth/logout')
def logout():
    session.clear()
    resp = make_response(jsonify({'success': True}))
    resp.set_cookie('session', '', expires=0, httponly=True)
    return resp

@app.get('/api/auth/verify')
def verify():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            return jsonify({'success': True, 'authenticated': True, 'user': user.to_dict()})
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth.split(' ', 1)[1]
        user = User.query.filter_by(api_token=token).first()
        if user:
            return jsonify({'success': True, 'authenticated': True, 'user': user.to_dict()})
    return jsonify({'success': True, 'authenticated': False})

@app.get('/api/auth/token')
@login_required
def token():
    user = User.query.get(session['user_id'])
    user.ensure_token()
    db.session.commit()
    return jsonify({'success': True, 'api_token': user.api_token})

# Embedding + Pinecone helpers
def generate_embedding(text: str):
    import openai
    openai.api_key = os.environ.get('OPENAI_API_KEY', '')
    if not openai.api_key:
        raise RuntimeError('OPENAI_API_KEY not configured')
    # text-embedding-3-small: 1536 dims
    resp = openai.Embedding.create(model="text-embedding-3-small", input=text)
    return resp['data'][0]['embedding']

def pinecone_index():
    import pinecone
    api = os.environ.get('PINECONE_API_KEY', '')
    env = os.environ.get('PINECONE_ENVIRONMENT', 'us-east-1')
    name = os.environ.get('PINECONE_INDEX_NAME', 'sjsunlp')
    if not api:
        raise RuntimeError('PINECONE_API_KEY not configured')
    pinecone.init(api_key=api, environment=env)
    if name not in pinecone.list_indexes():
        pinecone.create_index(name=name, dimension=1536, metric='cosine')
    return pinecone.Index(name)

# Routes: messages
@app.post('/api/messages/send')
@login_required
def send_message():
    data = request.get_json() or {}
    role = data.get('role') or 'user'
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'content required'}), 400
    user_id = session['user_id']
    msg = Message(
        user_id=user_id,
        role=role,
        content=content,
        problem_slug=data.get('problem_slug'),
        problem_id=data.get('problem_id'),
        problem_url=data.get('problem_url'),
        code_context=data.get('code_context'),
        model_used=data.get('model_used')
    )
    db.session.add(msg)
    db.session.commit()
    # Only embed user messages
    if role == 'user':
        try:
            emb = generate_embedding(content)
            idx = pinecone_index()
            metadata = {
                'user_id': str(user_id),
                'problem_slug': data.get('problem_slug') or '',
                'created_at': msg.created_at.isoformat(),
                'content': content[:500]
            }
            idx.upsert(vectors=[(f"message_{msg.id}", emb, metadata)])
            msg.embedding_id = f"message_{msg.id}"
            db.session.commit()
        except Exception as e:
            # Do not fail the request on embedding issues
            print('Embedding/Pinecone error:', e)
    return jsonify({'success': True, 'message': msg.to_dict()}), 201

@app.get('/api/messages/history')
@login_required
def history():
    user_id = session['user_id']
    limit = int(request.args.get('limit', 50))
    offset = int(request.args.get('offset', 0))
    problem_slug = request.args.get('problem_slug')
    q = Message.query.filter_by(user_id=user_id)
    if problem_slug:
        q = q.filter_by(problem_slug=problem_slug)
    q = q.order_by(Message.created_at.desc())
    items = q.limit(limit).offset(offset).all()
    total = q.count()
    return jsonify({'success': True, 'messages': [m.to_dict() for m in items], 'total': total, 'limit': limit, 'offset': offset})

# RAG search
@app.post('/api/rag/search')
@login_required
def rag_search():
    data = request.get_json() or {}
    query = (data.get('query') or '').strip()
    if not query:
        return jsonify({'error': 'query required'}), 400
    top_k = int(data.get('top_k', 5))
    problem_slug = data.get('problem_slug')
    emb = generate_embedding(query)
    idx = pinecone_index()
    flt = {'user_id': str(session['user_id'])}
    if problem_slug:
        flt['problem_slug'] = problem_slug
    res = idx.query(vector=emb, top_k=top_k, filter=flt, include_metadata=True)
    results = []
    for m in res.get('matches', []):
        vid = m['id']
        if vid.startswith('message_'):
            try:
                mid = int(vid.split('_')[1])
                msg = Message.query.get(mid)
                if msg and msg.user_id == session['user_id']:
                    d = msg.to_dict()
                    d['similarity_score'] = m['score']
                    results.append(d)
            except Exception:
                pass
    return jsonify({'success': True, 'messages': results, 'count': len(results)})

@app.get('/api/health')
def health():
    return jsonify({'status': 'ok', 'time': datetime.utcnow().isoformat()})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)


