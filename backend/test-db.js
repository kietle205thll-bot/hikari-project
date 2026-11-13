const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Kết nối Neon PostgreSQL thành công!');
    console.log('🕒 Thời gian server:', res.rows[0].current_time);
    console.log('🐘 Phiên bản:', res.rows[0].pg_version);
    await pool.end();
  } catch (err) {
    console.error('❌ Lỗi kết nối PostgreSQL:', err);
    process.exit(1);
  }
}

testConnection();

