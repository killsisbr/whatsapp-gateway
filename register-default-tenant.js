import { Store } from "./dist/store.js";
import crypto from "crypto";

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

    // 2. Criar tenant saas-web
    const tenants = store.loadTenants();
    let tenant = tenants.find(t => t.id === 'saas-web');
    if (!tenant) {
        tenant = {
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
        };
        tenants.push(tenant);
        store.saveTenants(tenants);
        console.log("Tenant 'saas-web' registrado com sucesso!");
    } else {
        console.log("Tenant 'saas-web' já existe.");
    }

    // 3. Criar API Key wha_live_saasweb
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
    } else {
        console.log("API Key 'wha_live_saasweb' já existe.");
    }
}

run().catch(console.error);
