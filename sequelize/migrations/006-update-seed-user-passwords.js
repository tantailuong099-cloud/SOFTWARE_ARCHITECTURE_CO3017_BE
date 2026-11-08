'use strict';

const bcrypt = require('bcrypt');

// Development seed password: password123
const seedPassword = 'password123';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate(
      'users',
      { password_hash: bcrypt.hashSync(seedPassword, 10) },
      {
        email: [
          'admin@tmc.com',
          'employee01@tmc.com',
          'employee02@tmc.com',
        ],
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkUpdate(
      'users',
      {
        password_hash:
          '$2b$10$Hhkn6PvXB/F6b24NIBUXx.MtNae4gMarsLMfLiCYSabZxVP.ozvv2',
      },
      {
        email: [
          'admin@tmc.com',
          'employee01@tmc.com',
          'employee02@tmc.com',
        ],
      },
    );
  },
};
