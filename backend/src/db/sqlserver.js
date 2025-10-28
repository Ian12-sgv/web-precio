const sql = require('mssql');

function envBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
}

function parseServerFromEnv() {
  let raw = process.env.SQLSERVER_SERVER || process.env.SQL_HOST || 'localhost';
  let host = raw, instanceName, port;

  if (raw.includes(',')) {
    const [h, p] = raw.split(',');
    host = h;
    const pn = parseInt(p, 10);
    if (!Number.isNaN(pn)) port = pn;
  }
  if (host.includes('\\')) {
    const [h, inst] = host.split('\\');
    host = h; instanceName = inst;
  }
  if (process.env.SQL_HOST) host = process.env.SQL_HOST;
  if (process.env.SQL_INSTANCE) instanceName = process.env.SQL_INSTANCE;
  if (process.env.SQL_PORT) port = parseInt(process.env.SQL_PORT, 10);

  return { host, instanceName, port };
}

const { host, instanceName, port } = parseServerFromEnv();
const database = process.env.SQLSERVER_DB || process.env.SQL_DB || 'inventario_local';
const user     = process.env.SQLSERVER_USER || process.env.SQL_USER || 'sa';
const password = process.env.SQLSERVER_PASSWORD || process.env.SQL_PASS || '';
const encrypt  = envBool(process.env.SQLSERVER_ENCRYPT ?? process.env.SQL_ENCRYPT, false);
const trust    = envBool(process.env.SQLSERVER_TRUSTSERVERCERTIFICATE ?? process.env.SQL_TRUST_SERVER_CERT, true);

const config = {
  server: host,
  database,
  user,
  password,
  ...(port && !instanceName ? { port } : {}),
  options: {
    instanceName: instanceName || undefined,
    encrypt,
    trustServerCertificate: trust
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let pool;
async function getPool() {
  if (pool) return pool;
  try {
    pool = await sql.connect(config);
    return pool;
  } catch (err) {
    pool = undefined;
    err.message = `SQL connect failed: ${err.message}`;
    throw err;
  }
}

async function query(text, params = []) {
  const p = await getPool();
  const req = p.request();
  for (const prm of params) {
    if (prm && prm.name) req.input(prm.name, prm.type || sql.VarChar, prm.value);
  }
  return req.query(text);
}

module.exports = { sql, query };
