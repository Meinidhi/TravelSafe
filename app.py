import os
import sqlite3
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

DB_FILE = 'database.sqlite'

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    # Users Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            phone TEXT,
            nationality TEXT,
            emergencyPhone TEXT,
            password TEXT,
            createdAt TEXT
        )
    ''')
    # Incidents Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            userId TEXT,
            type TEXT,
            lat REAL,
            lng REAL,
            severity TEXT,
            timestamp TEXT,
            status TEXT
        )
    ''')
    # Groups Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT,
            createdAt TEXT
        )
    ''')
    # Group Members Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS group_members (
            groupId TEXT,
            userId TEXT,
            joinedAt TEXT,
            PRIMARY KEY(groupId, userId)
        )
    ''')
    conn.commit()
    conn.close()

# Initialize DB on startup
if not os.path.exists(DB_FILE):
    init_db()
else:
    # ensure tables exist if file exists
    init_db()

@app.route('/')
def index():
    return app.send_static_file('index.html')

# --- AUTH API ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    try:
        user_id = 'usr_' + str(uuid.uuid4()).replace('-', '')[:15]
        now = datetime.utcnow().isoformat() + 'Z'
        
        c.execute('''
            INSERT INTO users (id, name, email, phone, nationality, emergencyPhone, password, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, data.get('name'), data.get('email'), data.get('phone'), 
              data.get('nationality'), data.get('emergencyPhone'), data.get('password'), now))
        conn.commit()
        
        user = c.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        return jsonify(dict(user)), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already registered'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE email = ? AND password = ?', (email, password)).fetchone()
    conn.close()
    
    if user:
        return jsonify(dict(user)), 200
    return jsonify({'error': 'Invalid email or password'}), 401

@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id):
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    if user:
        return jsonify(dict(user)), 200
    return jsonify({'error': 'User not found'}), 404

# --- INCIDENTS API ---
@app.route('/api/incidents', methods=['POST'])
def create_incident():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    try:
        inc_id = data.get('id', 'inc_' + str(uuid.uuid4()).replace('-', '')[:15])
        user_id = data.get('userId')
        inc_type = data.get('type')
        lat = data.get('lat')
        lng = data.get('lng')
        severity = data.get('severity', 'high')
        timestamp = data.get('timestamp', datetime.utcnow().isoformat() + 'Z')
        status = data.get('status', 'active')
        
        c.execute('''
            INSERT INTO incidents (id, userId, type, lat, lng, severity, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (inc_id, user_id, inc_type, lat, lng, severity, timestamp, status))
        conn.commit()
        
        incident = c.execute('SELECT * FROM incidents WHERE id = ?', (inc_id,)).fetchone()
        return jsonify(dict(incident)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/incidents', methods=['GET'])
def get_incidents():
    conn = get_db()
    incidents = conn.execute('SELECT * FROM incidents ORDER BY timestamp DESC').fetchall()
    conn.close()
    return jsonify([dict(inc) for inc in incidents]), 200

# --- GROUPS API ---
@app.route('/api/groups', methods=['POST'])
def create_group():
    data = request.json
    name = data.get('name')
    creator_id = data.get('creatorId')
    
    conn = get_db()
    c = conn.cursor()
    try:
        # Generate 6 char alphanumeric ID
        group_id = str(uuid.uuid4()).replace('-', '')[:6].upper()
        now = datetime.utcnow().isoformat() + 'Z'
        
        c.execute('INSERT INTO groups (id, name, createdAt) VALUES (?, ?, ?)', (group_id, name, now))
        c.execute('INSERT INTO group_members (groupId, userId, joinedAt) VALUES (?, ?, ?)', (group_id, creator_id, now))
        conn.commit()
        
        group = c.execute('SELECT * FROM groups WHERE id = ?', (group_id,)).fetchone()
        members = c.execute('SELECT * FROM group_members WHERE groupId = ?', (group_id,)).fetchall()
        
        result = dict(group)
        result['members'] = [dict(m) for m in members]
        return jsonify(result), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/groups/join', methods=['POST'])
def join_group():
    data = request.json
    group_id = data.get('groupId')
    user_id = data.get('userId')
    
    conn = get_db()
    c = conn.cursor()
    try:
        group = c.execute('SELECT * FROM groups WHERE id = ?', (group_id,)).fetchone()
        if not group:
            return jsonify({'error': 'Group not found'}), 404
            
        now = datetime.utcnow().isoformat() + 'Z'
        try:
            c.execute('INSERT INTO group_members (groupId, userId, joinedAt) VALUES (?, ?, ?)', (group_id, user_id, now))
            conn.commit()
        except sqlite3.IntegrityError:
            pass # Already a member, that's completely fine
            
        members = c.execute('SELECT * FROM group_members WHERE groupId = ?', (group_id,)).fetchall()
        result = dict(group)
        result['members'] = [dict(m) for m in members]
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/users/<user_id>/groups', methods=['GET'])
def get_user_groups(user_id):
    conn = get_db()
    # Find all groups user belongs to
    memberships = conn.execute('SELECT groupId FROM group_members WHERE userId = ?', (user_id,)).fetchall()
    group_ids = [m['groupId'] for m in memberships]
    
    results = []
    if group_ids:
        placeholders = ','.join('?' for _ in group_ids)
        groups = conn.execute(f'SELECT * FROM groups WHERE id IN ({placeholders})', group_ids).fetchall()
        
        for g in groups:
            group_dict = dict(g)
            members = conn.execute('SELECT * FROM group_members WHERE groupId = ?', (g['id'],)).fetchall()
            group_dict['members'] = [dict(m) for m in members]
            results.append(group_dict)
            
    conn.close()
    return jsonify(results), 200

if __name__ == '__main__':
    # Use port 3000 as expected, defaulting to 5000 if not specified but let's hardcode 3000
    app.run(host='0.0.0.0', port=3000, debug=True)
