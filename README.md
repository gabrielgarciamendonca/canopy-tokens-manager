# Canopy Signaling

API Nest mínima para **trocar invite tokens** (SDP/ICE). Não transporta vídeo.

Os blobs são dados de ligação da máquina. Por isso:

- Toda a API de salas exige login (email + password → JWT)
- O offer/answer **não entra em logs**
- `POST /v1/rooms` devolve só o código (`CN-XXXX-XXXX`), nunca o offer
- Só o host lê o answer
- Salas expiram em 15 minutos e são apagadas

O copy/paste no Discord continua a ser o fallback no cliente Canopy.

## Arranque

```powershell
copy env.example .env
# edita JWT_SECRET
npm install
npm run start:dev
```

`GET http://127.0.0.1:3000/v1/health`

## Auth

```
POST /v1/auth/register   { "email": "a@b.com", "password": "at-least-8" }
POST /v1/auth/login      { "email": "a@b.com", "password": "at-least-8" }
GET  /v1/auth/me         Authorization: Bearer <jwt>
```

Password: bcrypt (12 rounds). Email é a identidade; este serviço **não envia** correio (sem SMTP).

## Salas

```
POST /v1/rooms                  { "offer": "<InviteToken compact/JSON>" }
GET  /v1/rooms/:code            → { code, offer, expiresAt, hasAnswer }
PUT  /v1/rooms/:code/answer     { "answer": "<InviteToken compact/JSON>" }
GET  /v1/rooms/:code/answer     → host only
```

Em produção: HTTPS obrigatório. Não exponhas isto em HTTP aberto.

## Testes

```powershell
npm test
npm run test:e2e
```
