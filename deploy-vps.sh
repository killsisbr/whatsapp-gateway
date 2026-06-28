#!/bin/bash
set -e

# WhatsApp Gateway - Deploy Script for VPS
# Safe deployment: isolated container, no interference with existing services

VPS_HOST="${VPS_HOST:-82.29.58.126}"
VPS_USER="${VPS_USER:-admin}"
APP_NAME="whatsapp-gateway"
CONTAINER_PORT=3000
HOST_PORT="${HOST_PORT:-3001}"  # Use 3001 to avoid conflicts

echo "🚀 WhatsApp Gateway - Safe VPS Deploy"
echo "======================================"
echo "Target: ${VPS_USER}@${VPS_HOST}"
echo "Container: ${APP_NAME}"
echo "Port mapping: ${HOST_PORT}:${CONTAINER_PORT}"
echo ""

# 1. Build production image locally
echo "[1/5] Building Docker image..."
docker build -t ${APP_NAME}:latest .

# 2. Save and transfer image
echo "[2/5] Saving Docker image..."
docker save ${APP_NAME}:latest | ssh ${VPS_USER}@${VPS_HOST} "docker load"

# 3. Create isolated directories on VPS
echo "[3/5] Setting up isolated volumes..."
ssh ${VPS_USER}@${VPS_HOST} <<'SSH_EOF'
  # Create app directory
  mkdir -p ~/whatsapp-gateway/{data,session,logs}

  # Create .env file with safe defaults
  cat > ~/whatsapp-gateway/.env <<'ENV_EOF'
NODE_ENV=production
PORT=3000
JWT_SECRET=whatsapp-gateway-$(openssl rand -hex 32)
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
ENV_EOF

  # Secure permissions
  chmod 600 ~/whatsapp-gateway/.env
SSH_EOF

# 4. Stop and remove old container (if exists)
echo "[4/5] Stopping old container (if exists)..."
ssh ${VPS_USER}@${VPS_HOST} <<SSH_EOF
  # Stop container gracefully
  docker stop ${APP_NAME} 2>/dev/null || true
  docker rm ${APP_NAME} 2>/dev/null || true

  # Clean old images (keep last 3)
  docker images ${APP_NAME} --format '{{.ID}}' | tail -n +4 | xargs -r docker rmi 2>/dev/null || true
SSH_EOF

# 5. Start new container
echo "[5/5] Starting new container..."
ssh ${VPS_USER}@${VPS_HOST} <<SSH_EOF
  cd ~/whatsapp-gateway

  docker run -d \\
    --name ${APP_NAME} \\
    --restart unless-stopped \\
    --memory="512m" \\
    --memory-swap="512m" \\
    --cpus="1.0" \\
    -p ${HOST_PORT}:${CONTAINER_PORT} \\
    -e HOST_PORT=${HOST_PORT} \\
    --env-file .env \\
    -v ~/whatsapp-gateway/data:/app/data \\
    -v ~/whatsapp-gateway/session:/app/session \\
    -v ~/whatsapp-gateway/logs:/app/logs \\
    --health-cmd="wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1" \\
    --health-interval=30s \\
    --health-timeout=10s \\
    --health-retries=3 \\
    ${APP_NAME}:latest
SSH_EOF

# 6. Verify deployment
echo ""
echo "⏳ Waiting for container to start..."
sleep 5

echo "🔍 Verifying deployment..."
ssh ${VPS_USER}@${VPS_HOST} <<SSH_EOF
  docker ps --filter "name=${APP_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

  echo ""
  echo "Container logs (last 10 lines):"
  docker logs --tail 10 ${APP_NAME}

  echo ""
  echo "Health check:"
  docker exec ${APP_NAME} wget --no-verbose --tries=1 --spider http://localhost:3000/health || echo "Health check pending..."
SSH_EOF

echo ""
echo "✅ Deploy complete!"
echo "======================================"
echo "Service: ${APP_NAME}"
echo "Access: http://${VPS_HOST}:${HOST_PORT}"
echo "Swagger: http://${VPS_HOST}:${HOST_PORT}/docs"
echo ""
echo "To view logs: ssh ${VPS_USER}@${VPS_HOST} 'docker logs -f ${APP_NAME}'"
echo "To stop: ssh ${VPS_USER}@${VPS_HOST} 'docker stop ${APP_NAME}'"