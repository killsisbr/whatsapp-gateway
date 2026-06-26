# WhatsApp Gateway — Testes

## Rodando Testes

```bash
# Todos os testes
npm test

# Testes em watch mode (desenvolvimento)
npm run test:watch

# Testes com coverage
npm run test:coverage
```

## Estrutura de Testes

```
tests/
├── auth.test.ts              # Autenticação (registro, login, JWT)
├── tenants.test.ts           # TenantManager (unitários)
├── tenants-integration.test.ts # API REST de tenants (integração)
└── webhooks.test.ts          # WebhookManager (dispatch, retry)
```

## Cobertura Mínima

O projeto exige **60% de cobertura mínima** nas métricas:
- Statements
- Branches
- Functions
- Lines

## Escrevendo Novos Testes

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { YourClass } from '../src/your-module.js';

describe('YourClass', () => {
  let instance: YourClass;

  beforeEach(() => {
    instance = new YourClass();
  });

  it('should do something', async () => {
    const result = instance.doSomething();
    expect(result).toBe('expected');
  });
});
```

## Testes de Integração

Para testes de API com Supertest:

```typescript
import request from 'supertest';
import express from 'express';

const app = express();
app.get('/api/test', (req, res) => res.json({ ok: true }));

describe('GET /api/test', () => {
  it('should return ok', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
```