const bcrypt = require("bcryptjs");
const db = require("../config/db");

const email = process.argv[2];
const plain = process.argv[3] || email.split("@")[0];

if (!email) {
  console.error("Usage: node scripts/reset-faculty-password.js <email> [password]");
  process.exit(1);
}

(async () => {
  const hash = bcrypt.hashSync(plain, 10);
  await db.query(
    `UPDATE users SET password = ?, role_id = (SELECT id FROM roles WHERE name = 'faculty'),
     username = ?, must_change_password = FALSE WHERE LOWER(email) = ?`,
    [hash, plain, email.trim().toLowerCase()]
  );
  console.log("Updated", email, "password set to", plain);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
