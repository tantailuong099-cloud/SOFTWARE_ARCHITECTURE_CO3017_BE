'use strict';

const bcrypt = require('bcrypt');

const seedPassword = 'password123';
const users = [
  {
    employee_code: 'EMP-BD-003',
    full_name: 'Nguyen Thi Mai',
    display_name: 'Nguyen Thi Mai',
    email: 'employee03@tmc.com',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    factory_id: 'BINH_DUONG',
  },
  {
    employee_code: 'EMP-LA-001',
    full_name: 'Tran Van Binh',
    display_name: 'Tran Van Binh',
    email: 'employee04@tmc.com',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    factory_id: 'LONG_AN',
  },
  {
    employee_code: 'EMP-LA-002',
    full_name: 'Pham Thi Lan',
    display_name: 'Pham Thi Lan',
    email: 'employee05@tmc.com',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    factory_id: 'LONG_AN',
  },
  {
    employee_code: 'SUP-BD-001',
    full_name: 'Le Quoc Huy',
    display_name: 'Le Quoc Huy',
    email: 'supervisor@tmc.com',
    role: 'SUPERVISOR',
    status: 'ACTIVE',
    factory_id: 'BINH_DUONG',
  },
  {
    employee_code: 'HR-BD-001',
    full_name: 'Vo Thanh Hoa',
    display_name: 'Vo Thanh Hoa',
    email: 'hr.staff@tmc.com',
    role: 'HR_STAFF',
    status: 'ACTIVE',
    factory_id: 'BINH_DUONG',
  },
  {
    employee_code: 'SEC-LA-001',
    full_name: 'Dang Minh Khoa',
    display_name: 'Dang Minh Khoa',
    email: 'security.guard@tmc.com',
    role: 'SECURITY_GUARD',
    status: 'ACTIVE',
    factory_id: 'LONG_AN',
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const passwordHash = bcrypt.hashSync(seedPassword, 10);
      const now = new Date();

      for (const user of users) {
        await queryInterface.sequelize.query(
          `
            INSERT INTO "users"
              ("employee_code", "full_name", "display_name", "email",
               "password_hash", "refresh_token_hash", "role", "status",
               "factory_id", "created_at", "updated_at")
            VALUES
              (:employee_code, :full_name, :display_name, :email,
               :password_hash, NULL, :role, :status,
               :factory_id, :created_at, :updated_at)
          `,
          {
            replacements: {
              ...user,
              password_hash: passwordHash,
              created_at: now,
              updated_at: now,
            },
            transaction,
          },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          DELETE FROM "users"
          WHERE "employee_code" IN (:employeeCodes)
        `,
        {
          replacements: {
            employeeCodes: users.map((user) => user.employee_code),
          },
          transaction,
        },
      );
    });
  },
};
