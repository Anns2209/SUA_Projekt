# Login/Register Service

Flask mikrostoritev za prijavo, registracijo in upravljanje uporabniških računov.
Uporablja MySQL-kompatibilno bazo (MariaDB v Dockerju) in izdaja JWT tokene, ki jih
preverjajo ostale mikrostoritve preko `GET /token/verify`.

## Zagon (Docker Compose)

Iz mape `backend/`:

```bash
docker compose up --build mysql_users login-register-service
```

Storitev bo dostopna na `http://localhost:5001`.

## Testiranje endpointov (curl)

### 1. Registracija
```bash
curl -X POST http://localhost:5001/register \
  -H "Content-Type: application/json" \
  -d '{"ime":"Ana","priimek":"Gjorcheska","email":"ana@example.com","username":"ana","password":"geslo123"}'
```

### 2. Prijava (vrne token)
```bash
curl -X POST http://localhost:5001/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ana","password":"geslo123"}'
```

### 3. Podatki o uporabniku (potreben token)
```bash
curl http://localhost:5001/users/1 \
  -H "Authorization: Bearer <TOKEN>"
```

### 4. Preverjanje tokena (klic iz drugih storitev)
```bash
curl http://localhost:5001/token/verify \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Posodobitev profila
```bash
curl -X PUT http://localhost:5001/users/1 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ime":"Ana Marija"}'
```

### 6. Sprememba gesla
```bash
curl -X PUT http://localhost:5001/users/1/password \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"geslo123","new_password":"novoGeslo456"}'
```

### 7. Odjava iz vseh naprav
```bash
curl -X DELETE http://localhost:5001/users/1/sessions \
  -H "Authorization: Bearer <TOKEN>"
```

### 8. Izbris računa
```bash
curl -X DELETE http://localhost:5001/users/1 \
  -H "Authorization: Bearer <TOKEN>"
```

## Podatkovna baza

Tabela `users` se ustvari samodejno ob zagonu (`init_db()` v `app.py`), zato ni
potrebno ročno poganjati SQL skript.

| Stolpec | Opis |
|---|---|
| id | primarni ključ |
| ime, priimek, email, username | osebni podatki |
| password_hash | geslo, hashirano z Werkzeug (PBKDF2) |
| vloga | `uporabnik` ali `administrator` |
| token_version | uporabljeno za takojšen preklic vseh sej |
