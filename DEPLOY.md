# 🚀 WhatsApp Gateway - Guia de Deploy

**Versão:** 1.0.0  
**Última atualização:** 2026-06-27  
**Status:** ✅ Production-Ready

---

## 📋 Pré-requisitos

### Obrigatórios
- Docker 20.x+
- Docker Compose 2.x+
- Git

### Opcionais (para desenvolvimento)
- Node.js 18.x+
- npm 9.x+

---

## 🔧 Instalação Rápida

### 1. Clone o repositório
```bash
git clone https://github.com/seu-org/whatsapp-gateway.git
cd whatsapp-gateway
```

### 2. Gere a variável de ambiente
```bash
# Linux/Mac
JWT_SECRET=$(openssl rand -base64 32)

# Windows (PowerShell)
.JWT_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### 3. Configure o ambiente
```bash
cp .env.example .env
```

Edite `.env` com suas configurações:

```bash
PORT=3000
NODE_ENV=production
JWT_SECRET=<SEU_JWT_SECRET_AQUI>
LOG_LEVEL=info
REDIS_URL=redis://redis:6379
```

### 4. Deploy com Docker Compose
```bash
docker-compose up -d --build
```

### 5. Verifique o status
```bash
docker-compose ps
curl http://localhost:3000/health
```

---

## 🔑 Configuração Inicial

### 1. Escanear QR Code
Acesse o terminal ou use o endpoint:

```bash
# O QR Code será gerado automaticamente no startup
# Ou acesse: http://localhost:3000/api/qr
```

### 2. Criar primeiro tenant
```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "meu-projeto",
    "webhookUrl": "https://meusistema.com/webhook",
    "events": ["message", "status"]
  }'
```

**Resposta:**
```json
{
  "success": true,
  "apiKey": "wg_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "message": "Ten created. Scan QR to connect."
}
```

⚠️ **IMPORTANTE:** Salve a API key! Ela só é exibida uma vez.

---

## 📊 Comandos de Operação

### Health Check
```bash
curl http://localhost:3000/health
```

**Resposta:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "state": "RUNNING",
  "tenants.total": 1,
  "queue.pending": 0,
  "memory.heapUsedMB": 32.5,
  "uptime": 3600
}
```

### Métricas Prometheus
```bash
curl http://localhost:3000/metrics
```

### Logs em Tempo Real
```bash
docker-compose logs -f whatsapp-gateway
```

### Logs Filtrados
```bash
# Apenas erros
docker-compose logs -f whatsapp-gateway | grep ERROR

# Apenas de um tenant específico
docker-compose logs -f whatsapp-gateway | grep "tenant-a"
```

### Restart
```bash
docker-compose restart whatsapp-gateway
```

### Stop
```bash
docker-compose down
```

### Backup de Sessões
```bash
# Session data está em volumes Docker
docker volume ls | grep gateway-session
docker volume inspect whatsapp-gateway_session
```

---

## 🔒 Segurança

### API Keys
- Armazenadas com hash XOR + base64
- Exibidas apenas na criação
- Revogáveis via API

### Webhooks
- Assinatura HMAC-SHA256
- Valide o header `X-Webhook-Signature`
- Timestamp + nonce previnem replay attacks

### Rate Limiting
- 100 requisições/minuto por tenant
- Fallback em memória se Redis indisponível

### IP Whitelist (Opcional)
```bash
# Restringir acesso por IP
curl -X POST http://localhost:3000/api/ip-whitelist \
  -H "X-API-Key: wg_xxx" \
  -d '{"ips": ["192.168.1.0/24", "10.0.0.5"]}'
```

---

## 🏗️ Arquitetura

### Serviços
| Serviço | Porta | Descrição |
|---------|-------|-----------|
| whatsapp-gateway | 3000 | API principal |
| redis | 6379 | Rate limiting + filas |

### Volumes
| Volume | Propósito |
|--------|-----------|
| gateway-data | Dados dos tenants |
| gateway-session | Sessões Baileys |
| gateway-logs | Audit logs JSONL |
| redis-data | Dados Redis persistentes |

### Rede
- `gateway-network`: Bridge interna entre serviços

---

## 📈 Escalonamento

### Horizontal (Múltiplas Instâncias)
```yaml
# docker-compose.prod.yml
services:
  whatsapp-gateway:
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis-cluster:6379
```

### Variáveis de Ambiente para Escala
```bash
# Rate limiting compartilhado
REDIS_URL=redis://redis-cluster:6379

# Identificação da instância
INSTANCE_ID=gateway-1
```

---

## 🐛 Troubleshooting

### Gateway não inicia
```bash
# Verifique logs
docker-compose logs whatsapp-gateway

# Verifique se a porta está em uso
netstat -an | grep 3000
```

### QR Code não aparece
```bash
# Delete a sessão e reinicie
docker-compose down
docker volume rm whatsapp-gateway_session
docker-compose up -d
```

### Redis indisponível
```bash
docker-compose restart redis
docker-compose logs redis
```

### Webhooks falhando
```bash
# Verifique circuit breaker
curl http://localhost:3000/metrics | grep circuit

# Verifique filas de retry
curl http://localhost:3000/health | jq '.queue'
```

### Alta latência
```bash
# Verifique uso de memória
curl http://localhost:3000/health | jq '.memory'

# Aumente limites no docker-compose
# deploy.resources.limits.memory: 1G
```

---

## 📊 Monitoramento

### Dashboard
Acesse: `http://localhost:3000/dashboard`

**Métricas em tempo real:**
- Status do gateway
- Tenants ativos
- Fila de mensagens
- Memória heap/RSS
- Requests por segundo
- Webhooks disparados
- Falhas de entrega

### Grafana (Opcional)
Importe o dashboard de `grafana/whatsapp-gateway.json`

### Alertas Sugeridos
| Métrica | Threshold | Ação |
|---------|-----------|------|
| memory.heapUsedMB | > 400 | Scale up |
| queue.pending | > 1000 | Investigar |
| webhook.failures | > 10/min | Check circuit breaker |
| uptime | < 3600 | Restart automático |

---

## 🔄 CI/CD

### GitHub Actions
O pipeline executa:
1. Testes em Node 18, 20, 22
2. Build TypeScript
3. Security audit
4. Build Docker
5. Deploy (apenas main)

### Deploy Manual
```bash
# Build
npm run build

# Tag
git tag v1.0.0
git push origin v1.0.0

# Deploy via SSH
ssh deploy@server "cd /opt/whatsapp-gateway && docker-compose pull && docker-compose up -d"
```

---

## 📚 API Reference

###Endpoints Principais

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /api/send | Enviar mensagem |
| POST | /api/send/media | Enviar mídia |
| GET | /api/tenants | Listar tenants |
| POST | /api/tenants | Criar tenant |
| GET | /api/devices | Listar dispositivos |
| POST | /api/devices | Adicionar device |
| GET | /api/ip-whitelist | Gerenciar whitelist |
| GET | /api/plugins | Gerenciar plugins |
| GET | /health | Health check |
| GET | /metrics | Métricas |
| GET | /dashboard | Dashboard UI |

### Exemplo de Envio
```bash
curl -X POST http://localhost:3000/api/send \
  -H "X-API-Key: wg_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5541999999999",
    "text": "Olá!"
  }'
```

---

## 📝 Changelog

### v1.0.0 (2026-06-27)
- ✅ Session tokens (60s, uso único)
- ✅ API keys criptografadas
- ✅ HMAC-SHA256 webhooks
- ✅ Audit logs LGPD
- ✅ Circuit breaker
- ✅ Redis + BullMQ retry
- ✅ Dashboard em tempo real
- ✅ CLI de automação
- ✅ Multi-device support
- ✅ IP whitelist
- ✅ Plugin system
- ✅ 54 testes unitários
- ✅ CI/CD pipeline

---

## 🆘 Suporte

- **Issue Tracker:** https://github.com/seu-org/whatsapp-gateway/issues
- **Documentação:** https://github.com/seu-org/whatsapp-gateway/wiki
- **Email:** suporte@seu-org.com

---

## 📄 License

MIT License - ver arquivo LICENSE.