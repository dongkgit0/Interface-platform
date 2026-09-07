import hashlib
import json
import os
import re
import secrets
import time
import uuid

import requests
from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ENV_FILE = os.path.join(DATA_DIR, "environments.json")
IFACE_FILE = os.path.join(DATA_DIR, "interfaces.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
SECRET_FILE = os.path.join(DATA_DIR, ".secret_key")
AVATAR_DIR = os.path.join(DATA_DIR, "avatars")
ALLOWED_AVATAR_EXTS = {"png", "jpg", "jpeg", "gif", "webp"}


def _load_secret_key():
    """会话签名密钥：首次生成后持久化，重启服务不会让已登录的会话失效。"""
    if os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SECRET_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    return key


app.secret_key = _load_secret_key()


# ---------- 数据持久化 ----------

def _load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return default


def _save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


DEFAULT_ENVIRONMENTS = [
    {
        "id": "env_50",
        "name": "5.0环境",
        "base_url": "http://172.16.10.151",
        "customer": "C48",
        "api_key": "15CB3DD0E0632DCCD98D5EE62C066BEC",
        "auth_seq": "3023",
    },
    {
        "id": "env_30",
        "name": "3.0环境",
        "base_url": "http://172.16.10.139",
        "customer": "C224",
        "api_key": "4E5C0D2BFCF28BFF0A8D2235D200D589",
        "auth_seq": "3023",
    },
]

DEFAULT_INTERFACES = [
    {
        "id": "callTaskCreateByVoiceTransferAgent",
        "name": "创建外呼任务（语音转坐席）",
        "path": "/openapi/V2.0.6/callTaskCreateByVoiceTransferAgent",
        "body_template": {
            "seq": "123456",
            "userData": "userData",
            "taskName": "创建测试",
            "multiplier": 1,
            "agentGroup": 9999,
            "CIDGroup": 53,
            "callees": ["12345678901", "12345678902"],
            "maxConcurrence": 1,
            "cyclePlayTimes": 1,
            "voiceFileID": "39",
            "concurrenceMode": 0,
            "weekday1": ["1", "2", "3", "4", "5", "6", "0"],
            "startTime1": "00:00:00",
            "endTime1": "23:59:59",
        },
    }
]


def load_environments():
    return _load(ENV_FILE, DEFAULT_ENVIRONMENTS)


def load_interfaces():
    return _load(IFACE_FILE, DEFAULT_INTERFACES)


# ---------- 用户 & 登录 ----------

def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def load_users():
    users = _load(USERS_FILE, None)
    if users is None:
        # 首次运行创建默认账号 admin / 888888
        users = [{"username": "admin", "password": "888888"}]
        _save(USERS_FILE, users)
    return users


def _password_matches(user, password: str) -> bool:
    """兼容明文 password 与旧版 password_hash 两种存储格式。"""
    if "password" in user:
        return user["password"] == password
    if "password_hash" in user:
        return user["password_hash"] == _hash_password(password)
    return False


# ---------- 签名 & 调用 ----------

def generate_sign(customer: str, api_key: str, seq: str):
    ms_timestamp = str(int(time.time() * 1000))
    timestamp = ms_timestamp[:10]
    pwd_raw = f"{customer}@{timestamp}@{seq}@{api_key}"
    digest = hashlib.md5(pwd_raw.encode("utf-8")).hexdigest()
    return timestamp, digest


def do_call(base_url, path, customer, api_key, auth_seq, body):
    timestamp, digest = generate_sign(customer, api_key, auth_seq)
    payload = {
        "authentication": {
            "customer": customer,
            "timestamp": timestamp,
            "seq": auth_seq,
            "digest": digest,
        },
        "request": body,
    }
    url = base_url.rstrip("/") + path
    start = time.time()
    try:
        resp = requests.post(
            url, json=payload, headers={"Content-Type": "application/json"}, timeout=15
        )
        elapsed_ms = round((time.time() - start) * 1000)
        content_type = resp.headers.get("content-type", "")
        if content_type.startswith("application/json"):
            body_out = resp.json()
        else:
            body_out = {"raw_text": resp.text, "note": "非JSON响应"}
        return {
            "success": True,
            "url": url,
            "status_code": resp.status_code,
            "elapsed_ms": elapsed_ms,
            "request_payload": payload,
            "response": body_out,
        }
    except Exception as e:
        elapsed_ms = round((time.time() - start) * 1000)
        return {
            "success": False,
            "url": url,
            "error": str(e),
            "elapsed_ms": elapsed_ms,
            "request_payload": payload,
        }


# ---------- 页面 & 登录 ----------

@app.before_request
def require_login():
    """除登录页外，所有 /api/* 请求都必须已登录。"""
    if request.path.startswith("/api/"):
        if not session.get("user"):
            return jsonify({"error": "未登录，请先登录"}), 401


@app.route("/")
def index():
    if not session.get("user"):
        return redirect(url_for("login"))
    return render_template("index.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("user"):
        return redirect(url_for("index"))
    error = None
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        is_json = request.is_json
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        for u in load_users():
            if u["username"] == username and _password_matches(u, password):
                session["user"] = username
                if is_json:
                    return jsonify({"ok": True, "username": username})
                return redirect(url_for("index"))
        error = "账号或密码错误"
        if is_json:
            return jsonify({"error": error}), 401
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


def _avatar_path_for(username):
    """返回该用户已保存的头像文件路径；没有则返回 None。"""
    if not username or not os.path.isdir(AVATAR_DIR):
        return None
    safe = re.sub(r"[^\w.-]", "_", username)
    for f in os.listdir(AVATAR_DIR):
        if f.startswith(safe + "."):
            return os.path.join(AVATAR_DIR, f)
    return None


@app.route("/api/me", methods=["GET"])
def me():
    """返回当前登录用户信息（头像用用户名首字母，密码为明文便于展示）。"""
    username = session.get("user")
    for u in load_users():
        if u["username"] == username:
            return jsonify({
                "username": u["username"],
                "password": u.get("password", ""),
                "avatar_url": "/api/me/avatar" if _avatar_path_for(username) else None,
            })
    return jsonify({"error": "用户不存在"}), 404


@app.route("/api/me/avatar", methods=["GET"])
def get_avatar():
    path = _avatar_path_for(session.get("user"))
    if path:
        return send_file(path)
    return jsonify({"error": "暂无头像"}), 404


@app.route("/api/me/avatar", methods=["POST"])
def upload_avatar():
    username = session.get("user")
    file = request.files.get("avatar")
    if not file or not file.filename:
        return jsonify({"error": "请选择图片文件"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_AVATAR_EXTS:
        return jsonify({"error": "仅支持 png / jpg / jpeg / gif / webp 格式"}), 400
    data = file.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        return jsonify({"error": "图片不能超过 2MB"}), 400
    # 删除旧头像后保存新头像（文件名按用户名，便于多用户区分）
    old = _avatar_path_for(username)
    if old:
        try:
            os.remove(old)
        except OSError:
            pass
    os.makedirs(AVATAR_DIR, exist_ok=True)
    safe = re.sub(r"[^\w.-]", "_", username)
    dest = os.path.join(AVATAR_DIR, f"{safe}.{ext}")
    with open(dest, "wb") as f:
        f.write(data)
    return jsonify({"ok": True, "avatar_url": "/api/me/avatar"})


@app.route("/api/me/password", methods=["POST"])
def change_password():
    username = session.get("user")
    data = request.json or {}
    new_password = (data.get("password") or "").strip()
    if not new_password:
        return jsonify({"error": "密码不能为空"}), 400
    users = load_users()
    for u in users:
        if u["username"] == username:
            u["password"] = new_password
            u.pop("password_hash", None)  # 迁移旧版哈希存储为明文
            _save(USERS_FILE, users)
            return jsonify({"ok": True})
    return jsonify({"error": "用户不存在"}), 404


# ---------- 环境管理 API ----------

@app.route("/api/environments", methods=["GET"])
def get_environments():
    return jsonify(load_environments())


@app.route("/api/environments", methods=["POST"])
def upsert_environment():
    envs = load_environments()
    data = request.json or {}
    if not data.get("id"):
        data["id"] = "env_" + uuid.uuid4().hex[:8]
    for i, e in enumerate(envs):
        if e["id"] == data["id"]:
            envs[i] = data
            break
    else:
        envs.append(data)
    _save(ENV_FILE, envs)
    return jsonify(data)


@app.route("/api/environments/<env_id>", methods=["DELETE"])
def delete_environment(env_id):
    envs = [e for e in load_environments() if e["id"] != env_id]
    _save(ENV_FILE, envs)
    return jsonify({"ok": True})


# ---------- 接口预设管理 API ----------

@app.route("/api/interfaces", methods=["GET"])
def get_interfaces():
    return jsonify(load_interfaces())


@app.route("/api/interfaces", methods=["POST"])
def upsert_interface():
    ifaces = load_interfaces()
    data = request.json or {}
    if not data.get("id"):
        data["id"] = "iface_" + uuid.uuid4().hex[:8]
    for i, item in enumerate(ifaces):
        if item["id"] == data["id"]:
            ifaces[i] = data
            break
    else:
        ifaces.append(data)
    _save(IFACE_FILE, ifaces)
    return jsonify(data)


@app.route("/api/interfaces/<iface_id>", methods=["DELETE"])
def delete_interface(iface_id):
    ifaces = [i for i in load_interfaces() if i["id"] != iface_id]
    _save(IFACE_FILE, ifaces)
    return jsonify({"ok": True})


# ---------- 调用 API ----------

@app.route("/api/call", methods=["POST"])
def call_single():
    data = request.json or {}
    env = data["environment"]
    body = data["body"]
    path = data["path"]
    result = do_call(
        env["base_url"], path, env["customer"], env["api_key"], env["auth_seq"], body
    )
    return jsonify(result)


@app.route("/api/compare", methods=["POST"])
def call_compare():
    data = request.json or {}
    env_a = data["environment_a"]
    env_b = data["environment_b"]
    path = data["path"]
    # 双环境模式下 A / B 各自使用独立的 request 模板；兼容旧调用只传 body
    body_a = data.get("body_a") or data.get("body")
    body_b = data.get("body_b") or data.get("body")
    result_a = do_call(
        env_a["base_url"], path, env_a["customer"], env_a["api_key"], env_a["auth_seq"], body_a
    )
    result_b = do_call(
        env_b["base_url"], path, env_b["customer"], env_b["api_key"], env_b["auth_seq"], body_b
    )
    return jsonify({"a": result_a, "b": result_b})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
