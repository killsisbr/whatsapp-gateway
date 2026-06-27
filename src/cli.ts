#!/usr/bin/env node
/**
 * WhatsApp Gateway CLI
 *
 * Comandos para automação de operações:
 * - status: Verifica status do gateway
 * - restart: Reinicia o gateway
 * - logs: Visualiza logs em tempo real
 * - health: Health check detalhado
 * - metrics: Métricas Prometheus
 * - tenants: Lista tenants ativos
 */

import { Command } from 'commander';
import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function colorize(text: string, color: string): string {
  return `${color}${text}${COLORS.reset}`;
}

function checkGatewayRunning(): boolean {
  try {
    execSync('curl -s http://localhost:3000/health', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getHealth(): any {
  try {
    const output = execSync('curl -s http://localhost:3000/health', { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (err) {
    return null;
  }
}

function getMetrics(): string {
  try {
    return execSync('curl -s http://localhost:3000/metrics', { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function getLogs(tail: number = 50): void {
  const logFile = join(__dirname, '..', 'logs', 'gateway.log');
  try {
    execSync(`Get-Content "${logFile}" -Tail ${tail} -Wait`, {
      stdio: 'inherit',
      shell: 'powershell.exe',
    });
  } catch (err) {
    console.error(colorize('Logs não encontrados em ' + logFile, COLORS.red));
  }
}

function restartGateway(): void {
  console.log(colorize('Parando gateway...', COLORS.yellow));

  try {
    // Tenta parar processo node na porta 3000
    execSync('Get-NetTcpConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }', {
      shell: 'powershell.exe',
      stdio: 'pipe',
    });
    console.log(colorize('Gateway parado.', COLORS.green));
  } catch {
    console.log(colorize('Nenhum processo rodando na porta 3000.', COLORS.gray));
  }

  console.log(colorize('Iniciando gateway...', COLORS.yellow));
  const child = spawn('npm', ['start'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function formatUptime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${mins % 60}m`;
  if (hours > 0) return `${hours}h ${mins % 60}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

const program = new Command();

program
  .name('whatsapp-gateway')
  .description('CLI para automação do WhatsApp Gateway')
  .version(packageJson.version);

program
  .command('status')
  .description('Verifica status do gateway')
  .action(() => {
    console.log(colorize('\n📊 WHATSAPP GATEWAY STATUS\n', COLORS.cyan));

    const health = getHealth();

    if (!health) {
      console.log(colorize('❌ Gateway OFFLINE', COLORS.red));
      console.log('   Dica: Execute "whatsapp-gateway restart"');
      return;
    }

    console.log(colorize('✅ Gateway ONLINE', COLORS.green));
    console.log(`   Version: ${health.version}`);
    console.log(`   State: ${colorize(health.state.toUpperCase(), COLORS.green)}`);
    console.log(`   Uptime: ${formatUptime(health.uptime)}`);
    console.log(`   Tenants: ${health.tenants?.total || 0}`);
    console.log(`   Queue Pending: ${health.queue?.pending || 0}`);
    console.log(`   Memory Heap: ${health.memory?.heapUsed || 'N/A'}`);
    console.log(`   Memory RSS: ${health.memory?.rss || 'N/A'}`);
    console.log(colorize('\nUse "whatsapp-gateway logs" para ver logs em tempo real\n', COLORS.gray));
  });

program
  .command('health')
  .description('Health check detalhado em JSON')
  .option('--json', 'Output em JSON')
  .action((options) => {
    const health = getHealth();

    if (!health) {
      console.log(colorize('❌ Gateway OFFLINE', COLORS.red));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(health, null, 2));
    } else {
      console.log('✅ Healthy');
    }
  });

program
  .command('metrics')
  .description('Métricas Prometheus')
  .action(() => {
    const metrics = getMetrics();
    if (metrics) {
      console.log(metrics);
    } else {
      console.log(colorize('❌ Não foi possível obter métricas. Gateway OFFLINE?', COLORS.red));
    }
  });

program
  .command('logs')
  .description('Visualiza logs em tempo real')
  .option('-n, --lines <number>', 'Número de linhas para mostrar', '50')
  .option('-f, --follow', 'Acompanhar logs (tail -f)', false)
  .action((options) => {
    const lines = parseInt(options.lines, 10);
    const follow = options.follow;

    if (!follow) {
      const logFile = join(__dirname, '..', 'logs', 'gateway.log');
      try {
        const output = execSync(`Get-Content "${logFile}" -Tail ${lines}`, {
          encoding: 'utf-8',
          shell: 'powershell.exe',
        });
        console.log(output);
      } catch {
        console.error(colorize('Logs não encontrados', COLORS.red));
      }
    } else {
      getLogs(lines);
    }
  });

program
  .command('restart')
  .description('Reinicia o gateway')
  .action(() => {
    restartGateway();
  });

program
  .command('tenants')
  .description('Lista tenants ativos')
  .action(() => {
    console.log(colorize('\n🏢 TENANTS ATIVOS\n', COLORS.cyan));

    const health = getHealth();
    if (!health) {
      console.log(colorize('Gateway OFFLINE', COLORS.red));
      return;
    }

    // Tenta obter lista de tenants do health endpoint
    console.log(`Total: ${health.tenants?.total || 0} tenant(s)`);
    console.log(colorize('\nNota: Lista detalhada requer endpoint /api/tenants\n', COLORS.gray));
  });

program
  .command('deploy')
  .description('Deploy usando Docker Compose')
  .option('-d, --detach', 'Rodar em background', true)
  .action((options) => {
    console.log(colorize('\n🚀 DEPLOY DOCKER\n', COLORS.cyan));

    const dockerComposeFile = join(__dirname, '..', 'docker-compose.yml');

    try {
      const composeCmd = options.detach ? '-d' : '';
      execSync(`docker compose -f "${dockerComposeFile}" up ${composeCmd}`, {
        stdio: 'pipe',
        encoding: 'utf-8' as const,
      });
      console.log(colorize('\n✅ Deploy realizado com sucesso!\n', COLORS.green));
    } catch (err) {
      console.error(colorize('❌ Erro no deploy. Verifique se Docker está instalado e rodando.', COLORS.red));
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Para o gateway Docker')
  .action(() => {
    console.log(colorize('\n🛑 PARANDO GATEWAY\n', COLORS.yellow));

    const dockerComposeFile = join(__dirname, '..', 'docker-compose.yml');

    try {
      execSync(`docker compose -f "${dockerComposeFile}" down`, {
        stdio: 'pipe',
        encoding: 'utf-8' as const,
      });
      console.log(colorize('✅ Gateway parado.\n', COLORS.green));
    } catch {
      console.error(colorize('❌ Erro ao parar. Verifique se Docker está rodando.', COLORS.red));
    }
  });

program.parse();