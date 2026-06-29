// db.js - PostgreSQL with full MySQL compatibility wrapper
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME || process.env.POSTGRES_DB || "venuedb",
  process.env.DB_USER || process.env.POSTGRES_USER || "root",
  process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  {
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || "localhost",
    port: process.env.DB_PORT || process.env.POSTGRES_PORT || 5432,
    dialect: "postgres",
    timezone: "+05:30",
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    logging: false,
  }
);

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function buildBulkInsert(sql, params) {
  if (!Array.isArray(params) || params.length === 0) return { sql, params };

  if (/VALUES\s*\?/i.test(sql) && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
    const rows = params[0];
    let idx = 0;
    const rowPlaceholders = rows.map((row) => {
      const cols = row.map(() => `$${++idx}`).join(", ");
      return `(${cols})`;
    });
    const flatParams = rows.flat().map((v) => (v === undefined ? null : v));
    const newSql = sql.replace(/VALUES\s*\?/i, `VALUES ${rowPlaceholders.join(", ")}`);
    return { sql: newSql, params: flatParams };
  }

  if (/IN\s*\(\s*\?\s*\)/i.test(sql) && Array.isArray(params[0])) {
    let paramIdx = 0;
    const newParams = [];
    const newSql = sql.replace(/IN\s*\(\s*\?\s*\)/gi, () => {
      const arr = params[paramIdx++];
      const sanitizedArr = (arr || []).map((v) => (v === undefined ? null : v));
      const placeholders = sanitizedArr.map((_, i) => `$${newParams.length + i + 1}`).join(", ");
      newParams.push(...sanitizedArr);
      return `IN (${placeholders})`;
    });
    for (let i = paramIdx; i < params.length; i++) {
      newParams.push(params[i] === undefined ? null : params[i]);
    }
    return { sql: newSql, params: newParams };
  }

  const sanitized = Array.isArray(params) ? params.map((p) => (p === undefined ? null : p)) : params;
  return { sql: convertPlaceholders(sql), params: sanitized };
}

function extractRowCount(results, metadata) {
  if (metadata && typeof metadata === "object" && metadata.rowCount != null) {
    return metadata.rowCount;
  }
  if (Array.isArray(metadata) && metadata[0]?.rowCount != null) {
    return metadata[0].rowCount;
  }
  if (Array.isArray(results) && results.length > 0 && results[0]?.id != null) {
    return results.length;
  }
  return Array.isArray(results) ? results.length : 0;
}

async function runQuery(sql, params, transaction) {
  const { sql: pgSql, params: pgParams } = buildBulkInsert(sql, params);
  let finalSql = pgParams === params ? convertPlaceholders(pgSql) : pgSql;

  if (/^\s*INSERT/i.test(sql) && !/RETURNING\s+/i.test(finalSql)) {
    finalSql = finalSql.replace(/;?\s*$/, " RETURNING id");
  }

  const queryOpts = {
    bind: pgParams,
    type: Sequelize.QueryTypes.RAW,
  };
  if (transaction) queryOpts.transaction = transaction;

  const [results, metadata] = await sequelize.query(finalSql, queryOpts);

  if (/^\s*INSERT/i.test(sql)) {
    let insertId = null;
    if (Array.isArray(results) && results[0]) {
      const row = results[0];
      insertId = row.id ?? row.ID ?? (Array.isArray(row) ? row[0] : null);
    }
    return [{ insertId, affectedRows: 1 }, []];
  }

  if (/^\s*(DELETE|UPDATE)/i.test(sql)) {
    return [{ affectedRows: extractRowCount(results, metadata) }, []];
  }

  return [results ?? [], []];
}

async function query(sql, params = []) {
  return runQuery(sql, params);
}

async function getConnection() {
  const t = await sequelize.transaction();

  return {
    query: async (sql, params = []) => runQuery(sql, params, t),
    beginTransaction: async () => {},
    commit: async () => t.commit(),
    rollback: async () => t.rollback(),
    release: () => {},
  };
}

const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 2000;

async function connectWithRetry() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await sequelize.authenticate();
      console.log("PostgreSQL connected");
      return;
    } catch (err) {
      const isLast = i === MAX_RETRIES - 1;
      console.error(`PostgreSQL connection failed (attempt ${i + 1}/${MAX_RETRIES}):`, err.message);
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

module.exports = { query, execute: query, getConnection, connectWithRetry };
