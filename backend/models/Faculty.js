const db = require("../config/db"); // already promise-based

const Faculty = {
  create: async ({ name, department, email }) => {
    const sql =
      "INSERT INTO faculty (name, department, email) VALUES (?, ?, ?)";
    return db.query(sql, [name, department, email]);
  },

  getAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM faculty ORDER BY name ASC"
    );
    return rows;
  },

  count: async () => {
    const [rows] = await db.query(
      "SELECT COUNT(*) AS totalFaculty FROM faculty"
    );
    return rows[0];
  },

  updateMaxClassrooms: async (id, max) => {
    return db.query(
      "UPDATE faculty SET max_classrooms = ? WHERE id = ?",
      [max, id]
    );
  },

  deleteById: async (id) => {
    return db.query(
      "DELETE FROM faculty WHERE id = ?",
      [id]
    );
  },

deleteByIds: async (ids) => {
  if (ids.length === 0) return;
  const sql = `DELETE FROM faculty WHERE id IN (?)`;
  return db.query(sql, [ids]);
}, 

  deleteAll: async () => {
    return db.query("DELETE FROM faculty");
  }
};




module.exports = Faculty;
