import { buildApp } from './app.js';

const host = process.env.ORBITA_HOST ?? '127.0.0.1';
const port = Number(process.env.ORBITA_PORT ?? 3000);
const origin = process.env.ORBITA_ORIGIN ?? `http://127.0.0.1:${port}`;
const silentSeconds = Number(process.env.ORBITA_SILENT_SECONDS ?? 60);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(silentSeconds) || silentSeconds < 1) throw new Error('Configuration réseau invalide');
const app = await buildApp({
  dbPath: process.env.ORBITA_DB ?? './data/orbita.sqlite',
  origin, silentSeconds, adminPassword: process.env.ORBITA_ADMIN_PASSWORD ?? '',
  gmPassword: process.env.ORBITA_GM_PASSWORD ?? '', serveStatic: true,
});
await app.listen({ host, port });
console.log(`ORBITA écoute sur ${host}:${port}`);
