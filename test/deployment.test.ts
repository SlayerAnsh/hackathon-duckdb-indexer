import { expect, test } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('compose keeps data persistent and credentials isolated', () => {
  const { services: s } = Bun.YAML.parse(read('docker-compose.yml')) as any;
  expect(s.indexer.environment.PUBLIC_RPC_URL).toContain('PUBLIC_RPC_URL')
  expect(s.indexer.environment.BACKFILL_MODE).toBe('${BACKFILL_MODE:-logs}')
  expect(s.indexer.environment.FILL_USE_API_KEY).toBe('${FILL_USE_API_KEY:-false}')
  expect(s.indexer.environment.FILL_RPC_URL).toContain('FILL_RPC_URL')
  expect(s.indexer.environment.INDEX_EXPRESSION).toBe('${INDEX_EXPRESSION:-}')
  expect(s.indexer.expose).toEqual(['8080']);
  expect(s.indexer.ports).toBeUndefined();
  expect(s.indexer.env_file).toBeUndefined();
  expect(s.indexer.environment.ARKIV_API_KEY).toBe('${ARKIV_API_KEY:-}');
  expect(s.indexer.environment.SYNC_USE_API_KEY).toBe('${SYNC_USE_API_KEY:-false}');
  expect(s.indexer.volumes).toContain('${INDEX_DATA_PATH:-./data}:/data');
  expect(s.indexer.healthcheck.test.join(' ')).toContain("fetch('http://localhost:8080/health')");
  expect(s.web.depends_on.indexer.condition).toBe('service_started');
  expect(s.web.ports).toBeUndefined();
  expect(s.web.expose).toEqual(['3000']);
  expect(s.web.environment.INDEXER_URL).toBe('http://indexer:8080');
  expect(s.web.environment).toHaveProperty('NEXT_PUBLIC_ARKIV_RPC_URL');
  expect(s.web.build.args.NEXT_PUBLIC_ARKIV_RPC_URL).toBe(s.web.environment.NEXT_PUBLIC_ARKIV_RPC_URL);
  expect(s.web.build.args.NEXT_PUBLIC_EXPLORER_URL).toBe('${NEXT_PUBLIC_EXPLORER_URL:-https://rabdi.explorer.arkiv.network}');
  expect(s.web.environment.NEXT_PUBLIC_EXPLORER_URL).toBe(s.web.build.args.NEXT_PUBLIC_EXPLORER_URL);
  for (const name of ['PRIVY_APP_SECRET', 'DASHBOARD_PRIVATE_KEY', 'NEXT_PUBLIC_PRIVY_APP_ID'])
    expect(s.web.environment[name]).toBe('${' + name + ':-}');
  for (const name of ['NEXT_PUBLIC_PRIVY_APP_ID'])
    expect(s.web.build.args[name]).toBe('${' + name + ':-}');
  for (const name of ['indexer']) {
    expect(JSON.stringify(s[name])).not.toContain('DASHBOARD_PRIVATE_KEY');
    expect(JSON.stringify(s[name])).not.toContain('PRIVY_APP_SECRET');
  }
  for (const name of ['web']) {
    expect(s[name].env_file).toBeUndefined();
    // The key reaches the web server runtime for the /api/rpc read proxy, never a public variable or the build.
    expect(s[name].environment.ARKIV_API_KEY).toBe('${ARKIV_API_KEY:-}');
    for (const [variable, value] of Object.entries(s[name].environment))
      if (variable.startsWith('NEXT_PUBLIC_')) expect(String(value)).not.toContain('ARKIV_API_KEY');
  }
  for (const service of Object.values(s) as any[]) {
    expect(service.restart).toBe('unless-stopped');
    expect(service.build.context).toBe('.');
    expect(JSON.stringify(service.build.args ?? {})).not.toContain('ARKIV_API_KEY');
    expect(JSON.stringify(service.build.args ?? {})).not.toContain('DASHBOARD_PRIVATE_KEY');
    expect(JSON.stringify(service.build.args ?? {})).not.toContain('PRIVY_APP_SECRET');
  }
});

test('ARKIV_API_KEY stays in server code and never becomes a public variable', () => {
  function files(path: string): string[] {
    return readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`])
  }
  for (const path of ['docker-compose.yml', 'docker-compose.dokploy.yml', '.env.example', 'apps/web/Dockerfile', 'apps/web/next.config.ts', ...files('apps/web/lib'), ...files('apps/web/components'), ...files('apps/web/app')].filter(p => existsSync(new URL(`../${p}`, import.meta.url)))) {
    const text = read(path);
    expect(text).not.toContain('NEXT_PUBLIC_ARKIV_API_KEY');
    if (text.includes('ARKIV_API_KEY') && path.startsWith('apps/web/')) expect(path).toMatch(/^apps\/web\/lib\/dash\/server\//);
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
  for (const app of ['indexer', 'web']) {
    const file = read(`apps/${app}/Dockerfile`);
    expect(file).toContain('oven/bun:1.3');
    expect(file).toContain('bun.lock');
    expect(file).toContain('bun install --frozen-lockfile');
    for (const workspace of ['packages/core', 'apps/indexer', 'apps/web'])
      expect(file).toContain(`${workspace}/package.json`);
    expect(file).not.toContain('ARKIV_API_KEY');
  }
  expect(read('apps/indexer/Dockerfile')).toContain('CMD ["bun", "apps/indexer/src/main.ts"]');
  expect(read('apps/indexer/Dockerfile')).toContain('ENV DATA_DIR=/data');
  const web = read('apps/web/Dockerfile');
  expect(web).toContain('ARG NEXT_PUBLIC_EXPLORER_URL=https://rabdi.explorer.arkiv.network');
  expect(web).toContain('ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL');
  for (const name of ['NEXT_PUBLIC_PRIVY_APP_ID']) {
    expect(web).toContain(`ARG ${name}=`);
    expect(web).toContain(`ENV ${name}=$${name}`);
  }
  expect(web).not.toContain('DASHBOARD_PRIVATE_KEY');
  expect(web).not.toContain('PRIVY_APP_SECRET');
  expect(web).toContain('node:22-slim');
  expect(web).toContain('bun run --cwd apps/web build');
  expect(web).toContain('/.next/standalone ./');
  expect(web).toContain('/.next/static ./apps/web/.next/static');
  expect(web).not.toContain('apps/web/public');
  expect(web).toContain('CMD ["node", "apps/web/server.js"]');
  const ignore = read('.dockerignore');
  for (const value of ['**/node_modules', '**/.next', '.env', '.env.*', '.git', 'data']) expect(ignore).toContain(value);
  const env = read('.env.example');
  for (const name of ['NEXT_PUBLIC_PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'DASHBOARD_PRIVATE_KEY'])
    expect(env).toContain(`${name}=`);
  for (const value of ['ARKIV_API_KEY=', 'SYNC_USE_API_KEY=false', 'FILL_USE_API_KEY=false', 'INDEX_EXPRESSION=', 'NEXT_PUBLIC_ARKIV_RPC_URL=', 'NEXT_PUBLIC_EXPLORER_URL=']) expect(env).toContain(value);
});

test('submission docs cover dashboard identity, schema, expiry, and observed friction', () => {
  const readme = read('README.md');
  for (const value of ['up -d --build', '$creator', 'Open Source', 'Security', 'DataFusion', 'DuckLake', '9 October 2026 to the extended deadline of 20 October 2026', 'Pre-existing work: none', '## Why Arkiv', '## Why this pillar', '## On chain evidence', '0x1f61c3cac1612c020f64739b128c5f198939c8cd']) expect(readme).toContain(value);
  for (const path of ['README.md', 'arkiv/schema.md', 'apps/web/components/about/content.tsx']) expect(read(path).toLowerCase()).not.toContain('0xb0b87eddb0bc777eb663c7a11703ba5ed4849a28');
  const schema = read('arkiv/schema.md');
  for (const value of ['widget', 'dashboard', 'link', 'project', 'addr', 'atBlock', '50', 'payload', 'verify']) expect(schema).toContain(value);
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

 test('dashboard wallet is discovered at runtime instead of supplied as a public variable', () => {
  function files(path: string): string[] {
   return readdirSync(new URL(`../${path}`, import.meta.url), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`])
  }
  for (const path of ['apps/web/Dockerfile', 'docker-compose.yml', 'docker-compose.dokploy.yml', '.env.example', ...files('apps/web/lib'), ...files('apps/web/components')])
   expect(read(path)).not.toContain('NEXT_PUBLIC_DASHBOARD_WALLET')
 })


test('widget dashboard docs cover schema, runtime setup and self hosting', () => {
  const schema = read('arkiv/schema.md');
  for (const value of ['widget', 'dashboard', 'link', 'lifetimeDays', 'arkiv-sql-indexer-dash', 'executeBatch', 'predictEntityKeys', 'patchEntity'])
    expect(schema).toContain(value);
  const readme = read('README.md');
  for (const value of ['DASHBOARD_PRIVATE_KEY', 'PRIVY_APP_SECRET', 'NEXT_PUBLIC_PRIVY_APP_ID', 'GET /api/dash/config'])
    expect(readme).toContain(value);
  expect(readme).toContain("INDEX_EXPRESSION='$creator = addr(<dashboard wallet address>)'");
  expect(read('SPECS.md')).not.toContain('Saved queries stored as Arkiv entities (P2). Not implemented.');
  expect(read('DEVELOPER.md')).toContain('apps/web/.env.local');
});

 test('synthetic writer is removed from deployment', () => {
  for (const path of ['docker-compose.yml', 'docker-compose.dokploy.yml', '.env.example']) {
   expect(read(path)).not.toContain('DEMO_PRIVATE_KEY');
   expect(read(path)).not.toContain('DEMO_AGENT_ADDRESSES');
  }
  expect(existsSync(new URL('../apps/demo-writer', import.meta.url))).toBe(false);
  for (const path of ['docker-compose.yml', 'docker-compose.dokploy.yml']) {
   const { services } = Bun.YAML.parse(read(path)) as any;
   expect(Object.keys(services).sort()).toEqual(['indexer', 'web']);
  }
 })
