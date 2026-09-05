# Canopy Signaling

API Nest mínima para **trocar invite tokens** (SDP/ICE). Não transporta vídeo.

Os blobs são dados de ligação da máquina. Por isso:

- Toda a API de salas exige login (email + código de 6 dígitos → JWT)
- O offer/answer **não entra em logs**
- `POST /v1/rooms` devolve só o código (`CN-XXXX-XXXX`), nunca o offer
- Só o host lê o answer
- Salas expiram em 15 minutos e são apagadas

O copy/paste no Discord continua a ser o fallback no cliente Canopy.

## Arranque

```powershell
copy env.example .env
# edita JWT_SECRET e RESEND_API_KEY (ou SMTP_*)
npm install
npm run start:dev
```

`GET http://127.0.0.1:3000/v1/health`

## Auth

```
POST /v1/auth/request-code  { "email": "a@b.com" }
POST /v1/auth/verify        { "email": "a@b.com", "code": "123456" }
GET  /v1/auth/me            Authorization: Bearer <jwt>
```

O código vale 10 minutos. Sem password.

No Railway: **Variables** → `JWT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` (endereço no domínio verificado no Resend, ex. `Canopy <login@teu-dominio.com>`).
Start command: `node dist/main.js` (o `npm run build` corre no deploy).

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
