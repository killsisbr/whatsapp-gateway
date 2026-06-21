```mermaid
graph TB
    Admin["Admin escaneia QR 1x"]
    Gateway["WhatsApp Gateway :3000"]
    PA["Projeto A<br/>(webhook)"]
    PB["Projeto B<br/>(webhook)"]
    PC["Projeto C<br/>(webhook)"]
    WS["WhatsApp"]

    Admin -->|GET /api/qr| Gateway
    Gateway -->|Baileys socket| WS
    WS -->|mensagens recebidas| Gateway
    Gateway -->|POST webhook| PA
    Gateway -->|POST webhook| PB
    Gateway -->|POST webhook| PC
    PA -->|POST /api/send| Gateway
    PB -->|POST /api/send| Gateway
    PC -->|POST /api/send| Gateway
    Gateway -->|Baileys sendMessage| WS
```

## Fluxo

1. **Setup**: Admin inicia o Gateway, escaneia o QR 1x
2. **Registro**: Cada projeto faz `POST /api/webhook` com sua URL e eventos
3. **Envio**: Projetos chamam `POST /api/send` com `{to, text}` → Gateway envia via Baileys
4. **Recebimento**: Mensagens que chegam → Gateway dispara webhooks para todos os projetos inscritos no evento `message`
5. **Resiliência**: Reconexão automática se cair (exceto loggedOut). Sessão persistida em `session/`
