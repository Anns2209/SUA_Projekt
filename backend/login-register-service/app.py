# -*- coding: utf-8 -*-
"""
LOGIN/REGISTER SERVICE
-----------------------
Mikrostoritev za prijavo in registracijo uporabnikov.
Tehnologije: Flask + MySQL (pymysql) + JWT

Endpointi (2x GET, 2x POST, 2x PUT, 2x DELETE):
  GET    /users/<id>          - podatki o uporabniku
  GET    /token/verify        - preveri veljavnost JWT tokena (klicejo ga druge storitve)
  POST   /register            - registracija novega uporabnika
  POST   /login                - prijava, vrne JWT token
  PUT    /users/<id>          - posodobitev profila (ime, priimek, email)
  PUT    /users/<id>/password - sprememba gesla
  DELETE /users/<id>          - izbris uporabniškega računa
  DELETE /users/<id>/sessions - odjava iz vseh naprav (preklic vseh izdanih tokenov)
"""

import os
import time
import jwt
import datetime
import pymysql
from flask import Flask, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    """Dovoli klice lokalnega Next.js odjemalca do mikrostoritve."""
    origin = request.headers.get("Origin")
    allowed_origins = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-me")
TOKEN_EXP_HOURS = int(os.environ.get("TOKEN_EXP_HOURS", "24"))

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_NAME", "users_db"),
    "cursorclass": pymysql.cursors.DictCursor,
    "autocommit": False,
}


def get_db():
    return pymysql.connect(**DB_CONFIG)


def init_db(retries=10, delay=3):
    """Počaka, da je MySQL/MariaDB kontejner pripravljen, nato ustvari tabele."""
    last_err = None
    for attempt in range(retries):
        try:
            conn = get_db()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS users (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            ime VARCHAR(100) NOT NULL,
                            priimek VARCHAR(100) NOT NULL,
                            email VARCHAR(150) NOT NULL UNIQUE,
                            username VARCHAR(80) NOT NULL UNIQUE,
                            password_hash VARCHAR(255) NOT NULL,
                            vloga VARCHAR(20) NOT NULL DEFAULT 'uporabnik',
                            token_version INT NOT NULL DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ) ENGINE=InnoDB;
                        """
                    )
                conn.commit()
            finally:
                conn.close()
            print("[login-register-service] Baza pripravljena.")
            return
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"[login-register-service] Baza še ni pripravljena ({attempt+1}/{retries}): {e}")
            time.sleep(delay)
    raise RuntimeError(f"Povezava z bazo ni uspela: {last_err}")


# ---------------------------------------------------------------------------
# Pomožne funkcije
# ---------------------------------------------------------------------------

def generate_token(user):
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "vloga": user["vloga"],
        "ver": user["token_version"],
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXP_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token):
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])


def token_required(f):
    """Decorator: zahteva veljaven Bearer token in preveri token_version v bazi
    (omogoča takojšen preklic vseh sej z DELETE /users/<id>/sessions)."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Manjka Authorization: Bearer <token> glava"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token je potekel"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Neveljaven token"}), 401

        conn = get_db()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT token_version FROM users WHERE id=%s", (payload["sub"],))
                row = cur.fetchone()
        finally:
            conn.close()

        if not row or row["token_version"] != payload.get("ver"):
            return jsonify({"error": "Token je bil preklican, prijavite se znova"}), 401

        request.user = payload
        return f(*args, **kwargs)

    return wrapper


def user_public(row):
    return {
        "id": row["id"],
        "ime": row["ime"],
        "priimek": row["priimek"],
        "email": row["email"],
        "username": row["username"],
        "vloga": row["vloga"],
    }


# ---------------------------------------------------------------------------
# GET endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "login-register-service"})


@app.get("/users/<int:user_id>")
@token_required
def get_user(user_id):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ime, priimek, email, username, vloga FROM users WHERE id=%s",
                (user_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return jsonify({"error": "Uporabnik ne obstaja"}), 404
    return jsonify(row)


@app.get("/token/verify")
def verify_token():
    """Ta endpoint kličejo DRUGE mikrostoritve (npr. Order Service), da preverijo
    veljavnost tokena uporabnika, brez da bi bile odvisne od interne logike te storitve."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"valid": False, "error": "Manjka token"}), 401
    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        return jsonify({"valid": False, "error": "Token je potekel"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"valid": False, "error": "Neveljaven token"}), 401

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT token_version FROM users WHERE id=%s", (payload["sub"],))
            row = cur.fetchone()
    finally:
        conn.close()

    if not row or row["token_version"] != payload.get("ver"):
        return jsonify({"valid": False, "error": "Token preklican"}), 401

    return jsonify({
        "valid": True,
        "user_id": payload["sub"],
        "username": payload["username"],
        "vloga": payload["vloga"],
    })


# ---------------------------------------------------------------------------
# POST endpoints
# ---------------------------------------------------------------------------

@app.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    required = ["ime", "priimek", "email", "username", "password"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Manjkajoča polja: {', '.join(missing)}"}), 400

    password_hash = generate_password_hash(data["password"])
    vloga = data.get("vloga", "uporabnik")
    if vloga not in ("uporabnik", "administrator"):
        vloga = "uporabnik"

    conn = get_db()
    try:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """INSERT INTO users (ime, priimek, email, username, password_hash, vloga)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (data["ime"], data["priimek"], data["email"], data["username"],
                     password_hash, vloga),
                )
                conn.commit()
                new_id = cur.lastrowid
            except pymysql.err.IntegrityError:
                conn.rollback()
                return jsonify({"error": "Email ali uporabniško ime je že zasedeno"}), 409
    finally:
        conn.close()

    return jsonify({"message": "Registracija uspešna", "id": new_id}), 201


@app.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    requested_role = data.get("vloga", "uporabnik")
    if not username or not password:
        return jsonify({"error": "username in password sta obvezna"}), 400
    if requested_role not in ("uporabnik", "administrator"):
        return jsonify({"error": "Neveljavna vrsta prijave"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE username=%s", (username,))
            user = cur.fetchone()
    finally:
        conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Napačno uporabniško ime ali geslo"}), 401
    if user["vloga"] != requested_role:
        return jsonify({"error": f"Ta račun nima vloge: {requested_role}"}), 403

    token = generate_token(user)
    return jsonify({"token": token, "user": user_public(user)})


# ---------------------------------------------------------------------------
# PUT endpoints
# ---------------------------------------------------------------------------

@app.put("/users/<int:user_id>")
@token_required
def update_user(user_id):
    if request.user["sub"] != user_id and request.user["vloga"] != "administrator":
        return jsonify({"error": "Nimate dovoljenja za urejanje tega uporabnika"}), 403

    data = request.get_json(silent=True) or {}
    fields, values = [], []
    for col in ("ime", "priimek", "email"):
        if col in data:
            fields.append(f"{col}=%s")
            values.append(data[col])

    if not fields:
        return jsonify({"error": "Ni podanih polj za posodobitev"}), 400

    values.append(user_id)
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=%s", values)
            conn.commit()
            if cur.rowcount == 0:
                return jsonify({"error": "Uporabnik ne obstaja"}), 404
    finally:
        conn.close()

    return jsonify({"message": "Profil posodobljen"})


@app.put("/users/<int:user_id>/password")
@token_required
def change_password(user_id):
    if request.user["sub"] != user_id:
        return jsonify({"error": "Lahko spremenite le svoje geslo"}), 403

    data = request.get_json(silent=True) or {}
    old_password = data.get("old_password")
    new_password = data.get("new_password")
    if not old_password or not new_password:
        return jsonify({"error": "old_password in new_password sta obvezna"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id=%s", (user_id,))
            user = cur.fetchone()
            if not user or not check_password_hash(user["password_hash"], old_password):
                return jsonify({"error": "Staro geslo ni pravilno"}), 401

            new_hash = generate_password_hash(new_password)
            cur.execute(
                "UPDATE users SET password_hash=%s, token_version=token_version+1 WHERE id=%s",
                (new_hash, user_id),
            )
            conn.commit()
    finally:
        conn.close()

    return jsonify({"message": "Geslo spremenjeno. Prijaviti se morate znova."})


# ---------------------------------------------------------------------------
# DELETE endpoints
# ---------------------------------------------------------------------------

@app.delete("/users/<int:user_id>")
@token_required
def delete_user(user_id):
    if request.user["sub"] != user_id and request.user["vloga"] != "administrator":
        return jsonify({"error": "Nimate dovoljenja za brisanje tega računa"}), 403

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
            conn.commit()
            if cur.rowcount == 0:
                return jsonify({"error": "Uporabnik ne obstaja"}), 404
    finally:
        conn.close()

    return jsonify({"message": "Uporabniški račun izbrisan"})


@app.delete("/users/<int:user_id>/sessions")
@token_required
def revoke_sessions(user_id):
    """Odjava iz vseh naprav: poviša token_version, kar takoj izniči vse prej
    izdane JWT tokene za tega uporabnika."""
    if request.user["sub"] != user_id and request.user["vloga"] != "administrator":
        return jsonify({"error": "Nimate dovoljenja"}), 403

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET token_version = token_version + 1 WHERE id=%s", (user_id,)
            )
            conn.commit()
            if cur.rowcount == 0:
                return jsonify({"error": "Uporabnik ne obstaja"}), 404
    finally:
        conn.close()

    return jsonify({"message": "Vse seje so bile preklicane"})


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
else:
    # Ko teče pod gunicorn (produkcijski način v Dockerju)
    init_db()
