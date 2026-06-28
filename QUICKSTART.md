# 🚀 WhatsApp Gateway - Quick Start

## Status

- **Build**: ✅ PASS
- **Runtime**: ✅ Testado
- **Audit Logs**: ✅ Funcional

---

## 🔐 Session Token Manager (NOVO)

### Como Usar

#### 1. Solicitar QR Code

```bash
curl -X POST http://localhost:3000/api/session/request \
  -H "Content-Type: application/json" \
  -d '{"qrId": "meu-qr-123"}'
```

**Resposta:**
```json
{
  "success": true,
  "sessionToken": "uuid-aqui",
  "qrBase64": "data:image/png;base64,...",
  "qrTerminal": "QR code em ASCII",
  "expiresAt": 1719500000000,
  "expiresIn": 59000
}
```

⚠️ **Token expira em 60 segundos e é de uso único!**

#### 2. Escanear QR Code

Use a câmera do celular ou o QR no terminal:
```bash
# Se tiver qrcode-terminal instalado
node -e "console.log(require('fs').readFileSync('qr.txt', 'utf-8'))"
```

#### 3. Confirmar Scan e Gerar Credenciais

```bash
curl -X POST http://localhost:3000/api/session/confirm \
  -H "Content-Type: application/json" \
  -d '{"sessionToken": "uuid-aqui"}'
```

**Resposta:**
```json
{
  "success": true,
  "credentials": {
    "tenantId": "a1b2c3d4",
    "apiKey": "wha_a1b2c3d4_9f8e7d6c5b4a3210...",  # ⚠️ MOSTRADA UMA VEZ!
    "sessionPassword": "123456",
    "encryptedApiKey": "base64encoded..."
  },
  "message": "API key mostrada apenas uma vez. Guarde-a!"
}
```

---

## 🔑 Usando a API Key

### Enviar Mensagem

```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: wha_a1b2c3d4_9f8e7d6c5b4a3210..." \
  -d '{
    "to": "5541999999999",
    "text": "Olá do WhatsApp Gateway!"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "messageId": "3EB071E8EB4E61CE6CE512"
}
```

---

## 🔒 HMAC em Webhooks (NOVO)

### Configurando Webhook

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-API-Key: wha_a1b2c3d4_..." \
  -d '{
    "url": "https://meu-app.com/webhook",
    "events": ["message", "sent", "failed"]
  }'
```

### Validar Signature no Cliente

```javascript
// No seu servidor webhook
import { validateWebhookSignature } from './webhook-validator.js';

app.post('/webhook', (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  const ts = req.headers['x-webhook-timestamp'];
  const nonce = req.headers['x-webhook-nonce'];
  
  const valid = validateWebhookSignature(
    req.body, sig, ts, nonce, process.env.WEBHOOK_SECRET
  );
  
  if (!valid) return res.status(401).send('Invalid signature');
  
  // Processa evento
  console.log('Evento válido:', req.body);
  res.status(200).send('OK');
});
```

---

## 📊 Audit Logs

### Localização

```
logs/audit/audit-2026-06-27.jsonl
```

### Buscar Logs

```bash
# No gateway
cd D:\WHATSAPP-GATEWAY

# Filtrar logs de autenticação
grep "auth_success" logs/audit/*.jsonl

# Filtrar falhas
grep "auth_failure" logs/audit/*.jsonl

# Ver últimas 10 linhas
tail -10 logs/audit/*.jsonl
```

### Exportar Logs (Programático)

```javascript
import { auditLogger } from './audit.js';

const logs = auditLogger.search({
  startDate: '2026-06-27',
  event: 'auth_success',
  limit: 100
});

const csv = auditLogger.export({
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  format: 'csv'
});
```

---

## 🧪 Testar Agora

```bash
cd D:\WHATSAPP-GATEWAY
npm start
```

Terminal 2:
```bash
# Testar Session Token
curl -X POST http://localhost:3000/api/session/request
```

---

## 📁 Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/session/request` | Solicita QR com token (60s) |
| POST | `/api/session/confirm` | Confirma scan → credenciais |
| POST | `/api/session/rotate-key` | Rotaciona API key (PIN) |
| GET | `/api/session/stats` | Stats de tokens ativos |
| POST | `/api/send` | Envia mensagem WhatsApp |
| POST | `/api/webhook` | Registra webhook |

---

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# .env
PORT=3000
WEBHOOK_SECRET=sua-secret-key-aqui
ENCRYPTION_KEY=sua-chave-32-bytes
```

---

## ✅ Check-list Deploy

- [ ] Definir `WEBHOOK_SECRET` em `.env`
- [ ] Definir `ENCRYPTION_KEY` (32 bytes)
- [ ] Testar endpoint `/api/session/request`
- [ ] Escanear QR code
- [ ] Confirmar sessão em `/api/session/confirm`
- [ ] Guardar API key (mostrada 1 vez!)
- [ ] Testar envio `/api/send`
- [ ] Configurar webhook
- [ ] Validar HMAC no cliente

---

**Pronto!** Gateway seguro com:
- ✅ Session tokens efêmeros
- ✅ API keys criptografadas
- ✅ HMAC em webhooks
- ✅ Audit logs completos