require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

db.connect()
  .then((client) => {
    console.log("PostgreSQL Connected");
    client.release();
  })
  .catch(err => console.error("PostgreSQL connection error:", err.message));

module.exports = db;
