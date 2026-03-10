// db.js - PostgreSQL with full MySQL compatibility wrapper
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'venuedb',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    timezone: '+05:30',
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    logging: false
  }
);

// ─────────────────────────────────────────────────────────────
// Converts MySQL ? placeholders → PostgreSQL $1, $2, $3 ...
// ─────────────────────────────────────────────────────────────
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ─────────────────────────────────────────────────────────────
// MySQL-style VALUES ? bulk insert → unnest / VALUES ($1),($2)
// Handles: INSERT INTO t (a,b) VALUES ?  with [[v1,v2],[v3,v4]]
// ─────────────────────────────────────────────────────────────
function buildBulkInsert(sql, params) {
  if (!Array.isArray(params) || params.length === 0) return { sql, params };

  // Detect bulk pattern: VALUES ? with a 2D array
  if (/VALUES\s*\?/i.test(sql) && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
    const rows = params[0];
    let idx = 0;
    const rowPlaceholders = rows.map(row => {
      const cols = row.map(() => `$${++idx}`).join(', ');
      return `(${cols})`;
    });
    // Replace undefined with null - PostgreSQL bind fails on undefined
    const flatParams = rows.flat().map(v => (v === undefined ? null : v));
    const newSql = sql.replace(/VALUES\s*\?/i, `VALUES ${rowPlaceholders.join(', ')}`);
    return { sql: newSql, params: flatParams };
  }

  // Detect IN (?) pattern with an array value
  if (/IN\s*\(\s*\?\s*\)/i.test(sql) && Array.isArray(params[0])) {
    let paramIdx = 0;
    const newParams = [];
    const newSql = sql.replace(/IN\s*\(\s*\?\s*\)/gi, () => {
      const arr = params[paramIdx++];
      const sanitizedArr = (arr || []).map(v => (v === undefined ? null : v));
      const placeholders = sanitizedArr.map((_, i) => `$${newParams.length + i + 1}`).join(', ');
      newParams.push(...sanitizedArr);
      return `IN (${placeholders})`;
    });
    for (let i = paramIdx; i < params.length; i++) newParams.push(params[i] === undefined ? null : params[i]);
    return { sql: newSql, params: newParams };
  }

  // Sanitize params: undefined -> null (PostgreSQL bind fails on undefined)
  const sanitized = Array.isArray(params) ? params.map(p => (p === undefined ? null : p)) : params;
  return { sql: convertPlaceholders(sql), params: sanitized };
}

// ─────────────────────────────────────────────────────────────
// Main db.query — drop-in replacement for mysql2 pool.query
// Returns [rows, fields] just like mysql2
// ─────────────────────────────────────────────────────────────
async function query(sql, params = []) {
  const { sql: pgSql, params: pgParams } = buildBulkInsert(sql, params);
  let finalSql = pgParams === params ? convertPlaceholders(pgSql) : pgSql;

  // For INSERT: run ONCE with RETURNING id (avoid double-insert and aborted transaction)
  if (/^\s*INSERT/i.test(sql) && !/RETURNING\s+/i.test(finalSql)) {
    finalSql = finalSql.replace(/;?\s*$/, ' RETURNING id');
  }

  const [results] = await sequelize.query(finalSql, {
    bind: pgParams,
    type: Sequelize.QueryTypes.RAW
  });

  if (/^\s*INSERT/i.test(sql)) {
    let insertId = null;
    if (Array.isArray(results) && results[0]) {
      const row = results[0];
      insertId = row.id ?? row.ID ?? (Array.isArray(row) ? row[0] : null);
    }
    return [{ insertId, affectedRows: 1 }, []];
  }

  // For DELETE/UPDATE, return affectedRows
  if (/^\s*(DELETE|UPDATE)/i.test(sql)) {
    const count = Array.isArray(results) ? results.length : (results ?? 0);
    return [{ affectedRows: count }, []];
  }

  return [results ?? [], []];
}

// ─────────────────────────────────────────────────────────────
// Transaction connection — mimics mysql2 getConnection()
// ─────────────────────────────────────────────────────────────
async function getConnection() {
  const t = await sequelize.transaction();

  return {
    query: async (sql, params = []) => {
      const { sql: pgSql, params: pgParams } = buildBulkInsert(sql, params);
      let finalSql = pgParams === params ? convertPlaceholders(pgSql) : pgSql;

      if (/^\s*INSERT/i.test(sql) && !/RETURNING\s+/i.test(finalSql)) {
        finalSql = finalSql.replace(/;?\s*$/, ' RETURNING id');
      }

      const [results] = await sequelize.query(finalSql, {
        bind: pgParams,
        type: Sequelize.QueryTypes.RAW,
        transaction: t
      });

      if (/^\s*INSERT/i.test(sql)) {
        let insertId = null;
        if (Array.isArray(results) && results[0]) {
          const row = results[0];
          insertId = row.id ?? row.ID ?? (Array.isArray(row) ? row[0] : null);
        }
        return [{ insertId, affectedRows: 1 }, []];
      }

      if (/^\s*(DELETE|UPDATE)/i.test(sql)) {
        const count = Array.isArray(results) ? results.length : (results ?? 0);
        return [{ affectedRows: count }, []];
      }

      return [results ?? [], []];
    },
    beginTransaction: async () => { /* already started */ },
    commit: async () => t.commit(),
    rollback: async () => t.rollback(),
    release: () => { /* no-op for sequelize transactions */ }
  };
}

const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 2000;

async function connectWithRetry() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await sequelize.authenticate();
      console.log('✅ PostgreSQL connected');
      return;
    } catch (err) {
      const isLast = i === MAX_RETRIES - 1;
      console.error(`❌ PostgreSQL connection failed (attempt ${i + 1}/${MAX_RETRIES}):`, err.message);
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

module.exports = { query, execute: query, getConnection, connectWithRetry };