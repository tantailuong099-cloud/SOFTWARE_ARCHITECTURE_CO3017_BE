'use strict';

const passwordHash =
  '$2b$10$Hhkn6PvXB/F6b24NIBUXx.MtNae4gMarsLMfLiCYSabZxVP.ozvv2';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('users');

    if (!columns.employee_code) {
      await queryInterface.addColumn('users', 'employee_code', {
        type: Sequelize.STRING(50),
        allowNull: true,
        unique: true,
      });
    }
    if (!columns.full_name) {
      await queryInterface.addColumn('users', 'full_name', {
        type: Sequelize.STRING(150),
        allowNull: true,
      });
    }
    if (!columns.refresh_token_hash) {
      await queryInterface.addColumn('users', 'refresh_token_hash', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!columns.role) {
      await queryInterface.addColumn('users', 'role', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'EMPLOYEE',
      });
    }
    if (!columns.status) {
      await queryInterface.addColumn('users', 'status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'ACTIVE',
      });
    }

    await queryInterface.bulkInsert('users', [
      {
        employee_code: 'ADM-001',
        full_name: 'System Administrator',
        display_name: 'System Administrator',
        email: 'admin@tmc.com',
        password_hash: passwordHash,
        refresh_token_hash: null,
        role: 'ADMIN',
        status: 'ACTIVE',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        employee_code: 'EMP-BD-001',
        full_name: 'Nguyen Van An',
        display_name: 'Nguyen Van An',
        email: 'employee01@tmc.com',
        password_hash: passwordHash,
        refresh_token_hash: null,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        employee_code: 'EMP-BD-002',
        full_name: 'Le Hoang Nam (Inactive)',
        display_name: 'Le Hoang Nam (Inactive)',
        email: 'employee02@tmc.com',
        password_hash: passwordHash,
        refresh_token_hash: null,
        role: 'EMPLOYEE',
        status: 'INACTIVE',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: ['admin@tmc.com', 'employee01@tmc.com', 'employee02@tmc.com'],
    });
  },
};
