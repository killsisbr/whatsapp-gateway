import { Store } from "./dist/store.js";
import crypto from "crypto";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

async function run() {
    const store = new Store();
    
    // 1. Criar usuário admin se não existir
    const users = store.loadUsers();
    let admin = users.find(u => u.email === 'admin@gateway.local');
    if (!admin) {
        admin = {
            id: 'user-admin-id',
            name: 'Admin',
            email: 'admin@gateway.local',
            passwordHash: 'dummy',
            createdAt: new Date().toISOString()
        };
        users.push(admin);
        store.saveUsers(users);
    }

    // 2. Conectar ao SQLite do SAAS-WEB e ler tenants
    console.log("Lendo tenants do banco SQLite...");
    const db = await open({
        filename: 'D:/SAAS-WEB/server/database/deliveryhub.sqlite',
        driver: sqlite3.Database
    });

    const saasTenants = await db.all('SELECT id, name FROM tenants');
    await db.close();

    // 3. Registrar no Gateway
    const tenants = store.loadTenants();
    for (const t of saasTenants) {
        let tenant = tenants.find(gt => gt.id === t.id);
        if (!tenant) {
            tenant = {
                id: t.id,
                userId: admin.id,
                name: t.name,
                connected: false,
                state: 'disconnected',
                webhookUrl: `http://localhost:3005/api/webhooks/whatsapp`,
                webhookEvents: ['message', 'status', 'disconnect', 'qr'],
                createdAt: new Date().toISOString(),
                messagesSent: 0,
                messagesReceived: 0,
                messagesFailed: 0,
                qrScans: 0
            };
            tenants.push(tenant);
            console.log(`Registrado tenant: ${t.name} (${t.id})`);
        }
    }
    
    // Adicionar também o 'saas-web' padrão
    if (!tenants.find(gt => gt.id === 'saas-web')) {
        tenants.push({
            id: 'saas-web',
            userId: admin.id,
            name: 'SAAS-WEB Main',
            connected: false,
            state: 'disconnected',
            webhookUrl: 'http://localhost:3005/api/webhooks/whatsapp',
            webhookEvents: ['message', 'status', 'disconnect', 'qr'],
            createdAt: new Date().toISOString(),
            messagesSent: 0,
            messagesReceived: 0,
            messagesFailed: 0,
            qrScans: 0
        });
        console.log("Registrado tenant padrão: saas-web");
    }

    store.saveTenants(tenants);

    // 4. Registrar API Key wha_live_saasweb
    const apiKeys = store.loadApiKeys();
    let key = apiKeys.find(k => k.id === 'live');
    if (!key) {
        const plainKey = 'wha_live_saasweb';
        const encryptionKey = process.env.API_KEY_SECRET || "gateway-default-key-change-me";
        
        const keyHash = crypto.createHash("sha256").update(encryptionKey).digest();
        
        const result = [];
        for (let i = 0; i < plainKey.length; i++) {
            const charCode = plainKey.charCodeAt(i) ^ keyHash[i % keyHash.length];
            result.push(String.fromCharCode(charCode));
        }
        const encryptedApiKey = Buffer.from(result.join("")).toString("base64");

        key = {
            id: 'live',
            tenantId: 'live',
            name: 'SAAS-WEB Key',
            key: encryptedApiKey,
            createdAt: new Date().toISOString(),
            requestCount: 0
        };
        apiKeys.push(key);
        store.saveApiKeys(apiKeys);
        console.log("API Key 'wha_live_saasweb' registrada com sucesso!");
    }

    console.log("Todos os tenants e chaves sincronizados no Gateway!");
}

run().catch(console.error);
