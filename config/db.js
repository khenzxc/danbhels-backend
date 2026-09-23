const mysql = require('mysql2/promise');
require('dotenv').config();

const databaseUrl = process.env.MYSQL_ADDON_URI || process.env.DATABASE_URL;
const database = databaseUrl
  ? (() => {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.slice(1)),
      };
    })()
  : {
      host: process.env.MYSQL_ADDON_HOST || process.env.DB_HOST || 'localhost',
      port: Number(process.env.MYSQL_ADDON_PORT || process.env.DB_PORT || 3306),
      user: process.env.MYSQL_ADDON_USER || process.env.DB_USER || 'root',
      password: process.env.MYSQL_ADDON_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.MYSQL_ADDON_DB || process.env.DB_NAME || 'danbhels_gym',
    };

const pool = mysql.createPool({
  ...database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;