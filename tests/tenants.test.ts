import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { TenantManager } from '../src/tenant.js';
import { AuthManager } from '../src/auth.js';
import { Store } from '../src/store.js';
import { tenantRoutes } from '../src/routes/tenants.js';

function createTestApp() {
  const store = new Store('data/test_' + Date.now());
  const am = new AuthManager(store);
  const tm = new TenantManager(store);
  const app = express();
  app.use(express.json());

  // Auth routes
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    const result = am.register(name, email, password);
    if ('error' in result) return res.status(400).json(result);
    res.status(201).json(result);
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const result = am.login(email, password);
    if ('error' in result) return res.status(401).json(result);
    res.json(result);
  });

  app.use('/api/tenants', tenantRoutes(tm, am));

  return { app, am, tm };
}

describe('Tenant Routes', () => {
  let app: ReturnType<typeof createTestApp>['app'];
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const setup = createTestApp();
    app = setup.app;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner@test.com', password: 'pass123' });
    token = regRes.body.token;
    userId = regRes.body.user.id;
  });

  describe('POST /api/tenants/register', () => {
    it('should register a new tenant', async () => {
      const res = await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'My Tenant' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('My Tenant');
      expect(res.body.userId).toBe(userId);
      expect(res.body.state).toBe('disconnected');
    });

    it('should reject without name', async () => {
      const res = await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/tenants/register')
        .send({ name: 'No Auth' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tenants', () => {
    it('should list tenants for current user', async () => {
      await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'A' });
      await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'B' });

      const res = await request(app)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('should isolate tenants between users', async () => {
      await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Mine' });

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Other', email: 'other@test.com', password: 'pass123' });
      const otherToken = regRes.body.token;

      const res = await request(app)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /api/tenants/:id', () => {
    let tenantId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Single' });
      tenantId = res.body.id;
    });

    it('should get tenant by id', async () => {
      const res = await request(app)
        .get(`/api/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tenantId);
      expect(res.body.name).toBe('Single');
    });

    it('should return 404 for non-existent tenant', async () => {
      const res = await request(app)
        .get('/api/tenants/nope')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('should return 404 for other user tenant', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Other', email: 'other2@test.com', password: 'pass123' });
      const otherToken = regRes.body.token;

      await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Not Mine' });

      const res = await request(app)
        .get(`/api/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/tenants/:id', () => {
    let tenantId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/tenants/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Delete Me' });
      tenantId = res.body.id;
    });

    it('should delete tenant', async () => {
      const res = await request(app)
        .delete(`/api/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});