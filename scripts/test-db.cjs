require('dotenv').config();
const { Sequelize } = require('sequelize');

const url =
  process.env.DATABASE_URL_POOLED ||
  process.env.DATABASE_URL ||
  `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

console.log('Connecting to Neon DB:', url.replace(/:[^:@]+@/, ':****@'));

const sequelize = new Sequelize(url, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  logging: false,
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('>> Connection to Neon PostgreSQL established successfully!');
    const [results] = await sequelize.query('SELECT NOW() as current_time, version() as version;');
    console.log('Neon Database info:');
    console.log(' - Server Time:', results[0].current_time);
    console.log(' - Version:    ', results[0].version);
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('>> Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
