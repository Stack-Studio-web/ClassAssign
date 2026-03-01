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
    const flatParams = rows.flat();
    const newSql = sql.replace(/VALUES\s*\?/i, `VALUES ${rowPlaceholders.join(', ')}`);
    return { sql: newSql, params: flatParams };
  }

  // Detect IN (?) pattern with an array value
  if (/IN\s*\(\s*\?\s*\)/i.test(sql) && Array.isArray(params[0])) {
    let paramIdx = 0;
    const newParams = [];
    const newSql = sql.replace(/IN\s*\(\s*\?\s*\)/gi, () => {
      const arr = params[paramIdx++];
      const placeholders = arr.map((_, i) => `$${newParams.length + i + 1}`).join(', ');
      newParams.push(...arr);
      return `IN (${placeholders})`;
    });
    // Append remaining params
    for (let i = paramIdx; i < params.length; i++) newParams.push(params[i]);
    return { sql: newSql, params: newParams };
  }

  return { sql: convertPlaceholders(sql), params };
}

// ─────────────────────────────────────────────────────────────
// Main db.query — drop-in replacement for mysql2 pool.query
// Returns [rows, fields] just like mysql2
// ─────────────────────────────────────────────────────────────
async function query(sql, params = []) {
  const { sql: pgSql, params: pgParams } = buildBulkInsert(sql, params);
  const finalSql = pgParams === params ? convertPlaceholders(pgSql) : pgSql;

  const [results] = await sequelize.query(finalSql, {
    bind: pgParams,
    type: Sequelize.QueryTypes.RAW
  });

  // Attach insertId for INSERT statements (PostgreSQL uses RETURNING)
  if (/^\s*INSERT/i.test(sql)) {
    // Re-run with RETURNING id to get insertId
    const returningSql = finalSql.replace(/;?\s*$/, ' RETURNING id');
    try {
      const [rows] = await sequelize.query(returningSql, {
        bind: pgParams,
        type: Sequelize.QueryTypes.RAW
      });
      const insertId = rows?.[0]?.id ?? null;
      return [{ insertId, affectedRows: 1 }, []];
    } catch {
      return [{ insertId: null, affectedRows: 1 }, []];
    }
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
      const finalSql = pgParams === params ? convertPlaceholders(pgSql) : pgSql;

      const [results] = await sequelize.query(finalSql, {
        bind: pgParams,
        type: Sequelize.QueryTypes.RAW,
        transaction: t
      });

      if (/^\s*INSERT/i.test(sql)) {
        const returningSql = finalSql.replace(/;?\s*$/, ' RETURNING id');
        try {
          const [rows] = await sequelize.query(returningSql, {
            bind: pgParams,
            type: Sequelize.QueryTypes.RAW,
            transaction: t
          });
          const insertId = rows?.[0]?.id ?? null;
          return [{ insertId, affectedRows: 1 }, []];
        } catch {
          return [{ insertId: null, affectedRows: 1 }, []];
        }
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

sequelize.authenticate()
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch(err => console.error('❌ PostgreSQL connection failed:', err));

module.exports = { query, execute: query, getConnection };