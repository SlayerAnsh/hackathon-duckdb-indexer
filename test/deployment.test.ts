import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('compose keeps data persistent, credentials isolated, and writer opt in', () => {
  const { services: s } = Bun.YAML.parse(read('docker-compose.yml')) as any;
  expect(s.indexer.environment.PUBLIC_RPC_URL).toContain('PUBLIC_RPC_URL')
  expect(s.indexer.environment.BACKFILL_MODE).toBe('${BACKFILL_MODE:-logs}')
  expect(s.indexer.environment.FILL_USE_API_KEY).toBe('${FILL_USE_API_KEY:-false}')
  expect(s.indexer.environment.FILL_RPC_URL).toContain('FILL_RPC_URL')
  expect(s.indexer.environment.INDEX_EXPRESSION).toBe('${INDEX_EXPRESSION:-}')
  expect(s.indexer.expose).toEqual(['8080']);
  expect(s.indexer.ports).toBeUndefined();
  expect(s.indexer.env_file).toBeUndefined();
  expect(s.indexer.environment.TIRAMISU_API_KEY).toBe('${TIRAMISU_API_KEY:-}');
  expect(s.indexer.environment.SYNC_USE_API_KEY).toBe('${SYNC_USE_API_KEY:-false}');
  expect(JSON.stringify(s.indexer)).not.toContain('DEMO_PRIVATE_KEY');
  expect(s.indexer.volumes).toContain('${INDEX_DATA_PATH:-./data}:/data');
  expect(s.indexer.healthcheck.test.join(' ')).toContain("fetch('http://localhost:8080/health')");
  expect(s.web.depends_on.indexer.condition).toBe('service_started');
  expect(s.web.ports).toBeUndefined();
  expect(s.web.expose).toEqual(['3000']);
  expect(s.web.environment.INDEXER_URL).toBe('http://indexer:8080');
  expect(s.web.environment).toHaveProperty('NEXT_PUBLIC_TIRAMISU_RPC_URL');
  expect(s.web.build.args.NEXT_PUBLIC_TIRAMISU_RPC_URL).toBe(s.web.environment.NEXT_PUBLIC_TIRAMISU_RPC_URL);
  expect(s.web.build.args.NEXT_PUBLIC_EXPLORER_URL).toBe('${NEXT_PUBLIC_EXPLORER_URL:-https://tiramisu.explorer.arkiv.network}');
  expect(s.web.environment.NEXT_PUBLIC_EXPLORER_URL).toBe(s.web.build.args.NEXT_PUBLIC_EXPLORER_URL);
  expect(s['demo-writer'].profiles).toEqual(['demo']);
  for (const name of ['web', 'demo-writer']) {
    expect(s[name].env_file).toBeUndefined();
    expect(JSON.stringify(s[name])).not.toContain('TIRAMISU_API_KEY');
  }
  for (const service of Object.values(s) as any[]) {
    expect(service.restart).toBe('unless-stopped');
    expect(service.build.context).toBe('.');
    expect(JSON.stringify(service.build.args ?? {})).not.toContain('TIRAMISU_API_KEY');
  }
});

test('web mounts the index read only for the disk fallback', () => {
  const { services: s } = Bun.YAML.parse(read('docker-compose.yml')) as any;
  expect(s.web.volumes).toEqual(['${INDEX_DATA_PATH:-./data}:/data:ro']);
  expect(s.web.environment.DATA_DIR).toBe('/data');
});

test('dokploy compose matches the base file except for the named index volume and no expose', () => {
  const base = Bun.YAML.parse(read('docker-compose.yml')) as any, dokploy = Bun.YAML.parse(read('docker-compose.dokploy.yml')) as any;
  expect(dokploy.volumes).toEqual({ 'index-data': null });
  expect(dokploy.services.indexer.volumes).toEqual(['index-data:/data']);
  expect(dokploy.services.web.volumes).toEqual(['index-data:/data:ro']);
  for (const name of ['indexer', 'web']) expect(dokploy.services[name].expose).toBeUndefined();
  for (const name of Object.keys(base.services)) expect({ ...dokploy.services[name], volumes: undefined, expose: undefined }).toEqual({ ...base.services[name], volumes: undefined, expose: undefined });
});

test('images use locked workspace installs and the standalone runtime layout', () => {
  for (const app of ['indexer', 'web', 'demo-writer']) {
    const file = read(`apps/${app}/Dockerfile`);
    expect(file).toContain('oven/bun:1.3');
    expect(file).toContain('bun.lock');
    expect(file).toContain('bun install --frozen-lockfile');
    for (const workspace of ['packages/core', 'apps/indexer', 'apps/web', 'apps/demo-writer'])
      expect(file).toContain(`${workspace}/package.json`);
    expect(file).not.toContain('TIRAMISU_API_KEY');
  }
  expect(read('apps/indexer/Dockerfile')).toContain('CMD ["bun", "apps/indexer/src/main.ts"]');
  expect(read('apps/indexer/Dockerfile')).toContain('ENV DATA_DIR=/data');
  const web = read('apps/web/Dockerfile');
  expect(web).toContain('ARG NEXT_PUBLIC_EXPLORER_URL=https://tiramisu.explorer.arkiv.network');
  expect(web).toContain('ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL');
  expect(web).toContain('node:22-slim');
  expect(web).toContain('bun run --cwd apps/web build');
  expect(web).toContain('/.next/standalone ./');
  expect(web).toContain('/.next/static ./apps/web/.next/static');
  expect(web).not.toContain('apps/web/public');
  expect(web).toContain('CMD ["node", "apps/web/server.js"]');
  const ignore = read('.dockerignore');
  for (const value of ['**/node_modules', '**/.next', '.env', '.env.*', '.git', 'data']) expect(ignore).toContain(value);
  const env = read('.env.example');
  for (const value of ['TIRAMISU_API_KEY=', 'SYNC_USE_API_KEY=false', 'FILL_USE_API_KEY=false', 'INDEX_EXPRESSION=', 'DEMO_PRIVATE_KEY=', 'DEMO_AGENT_ADDRESSES=', 'NEXT_PUBLIC_TIRAMISU_RPC_URL=', 'NEXT_PUBLIC_EXPLORER_URL=']) expect(env).toContain(value);
});

test('submission docs cover demo identity, schema, expiry, and observed friction', () => {
  const readme = read('README.md');
  for (const value of ['0x1f61c3cac1612C020f64739B128C5f198939C8Cd', '0xb0B87EdDB0bc777Eb663c7a11703ba5ED4849A28', '0xF1BC753cF42d0157Ac34E28DBf06108F66aDB3B3', 'up -d --build', 'COMPOSE_PROFILES=demo', '$creator', 'Open Source', 'Security', 'DataFusion', 'DuckLake', '9 to 18 October 2026']) expect(readme).toContain(value);
  const schema = read('arkiv/schema.md');
  for (const value of ['ticket', 'comment', 'heartbeat', 'title', 'status', 'priority', 'assignee', 'project', 'u64', 'addr', 'atBlock', '50', 'payload', 'verify', '600']) expect(schema).toContain(value);
  const friction = read('arkiv/friction.md');
  for (const value of ['ANON_COST_LIMITED', '429', '-32004', '100', 'Arkiv-Quota-Used-Percent', '2,800', '4,011']) expect(friction).toContain(value);
  for (const value of ['SYNC_USE_API_KEY', 'API key not used']) expect(readme).toContain(value);
  expect((friction.match(/### Expected/g) ?? []).length).toBe(4);
  expect(read('LICENSE')).toContain('MIT License');
  expect(read('LICENSE')).toContain('2026 Anshudhar');
  expect(read('CHANGELOG.md')).toContain('0.1.0');
  expect(read('DEVELOPER.md')).toContain('bun test');
  for (const path of ['README.md', 'arkiv/schema.md', 'arkiv/friction.md', 'DEVELOPER.md', 'CHANGELOG.md']) {
    const prose = read(path).replace(/```[\s\S]*?```/g, '').replace(/^\s*[-*] /gm, '');
    expect(prose).not.toMatch(/—|–| - /);
  }
});
