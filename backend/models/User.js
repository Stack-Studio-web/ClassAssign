const db = require("../config/db");

const User = {
  // CREATE LOCAL USER
  createLocal: async ({ username, email, password }) => {
    const sql = `
      INSERT INTO users (username, email, password)
      VALUES (?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      username.trim(),
      email.trim().toLowerCase(),
      password,
    ]);

    return result.insertId;
  },

  // CREATE / FIND MICROSOFT USER
  createOrFindMicrosoft: async ({ microsoft_id, email, username }) => {
    const [existing] = await db.query(
      "SELECT * FROM users WHERE microsoft_id = ?",
      [microsoft_id]
    );

    if (existing.length) return existing[0];

    const sql = `
      INSERT INTO users (username, email, microsoft_id, password)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      username,
      email.toLowerCase(),
      microsoft_id,
      "MICROSOFT_SSO",
    ]);

    return { id: result.insertId };
  },

  // LINK MICROSOFT TO EXISTING USER ✅
  linkMicrosoft: async (userId, microsoftId) => {
    await db.query(
      "UPDATE users SET microsoft_id = ? WHERE id = ?",
      [microsoftId, userId]
    );
  },

  // FINDERS
  findByEmail: async (email) => {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email.toLowerCase()]
    );
    return rows[0];
  },

  findByUsername: async (username) => {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    return rows[0];
  },

  findByMicrosoftId: async (microsoftId) => {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE microsoft_id = ?",
      [microsoftId]
    );
    return rows[0];
  },
};

module.exports = User;
