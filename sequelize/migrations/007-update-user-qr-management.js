'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          UPDATE "users"
          SET "employee_code" = CONCAT('EMP-', LPAD("id"::text, 6, '0'))
          WHERE "employee_code" IS NULL OR BTRIM("employee_code") = ''
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
          UPDATE "users"
          SET "full_name" = COALESCE(NULLIF(BTRIM("display_name"), ''), "email")
          WHERE "full_name" IS NULL OR BTRIM("full_name") = ''
        `,
        { transaction },
      );

      await queryInterface.changeColumn(
        'users',
        'employee_code',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
        },
        { transaction },
      );
      await queryInterface.changeColumn(
        'users',
        'full_name',
        {
          type: Sequelize.STRING(150),
          allowNull: false,
        },
        { transaction },
      );

      const columns = await queryInterface.describeTable('users', {
        transaction,
      });
      if (!columns.factory_id) {
        await queryInterface.addColumn(
          'users',
          'factory_id',
          {
            type: Sequelize.STRING(20),
            allowNull: true,
          },
          { transaction },
        );
      }
      await queryInterface.sequelize.query(
        `
          ALTER TABLE "users"
          DROP CONSTRAINT IF EXISTS "users_role_check";
          ALTER TABLE "users"
          ADD CONSTRAINT "users_role_check"
          CHECK ("role" IN ('EMPLOYEE', 'SUPERVISOR', 'HR_STAFF', 'SECURITY_GUARD', 'ADMIN'));
          ALTER TABLE "users"
          ADD CONSTRAINT "users_factory_id_check"
          CHECK ("factory_id" IS NULL OR "factory_id" IN ('BINH_DUONG', 'LONG_AN'))
        `,
        { transaction },
      );
      await queryInterface.addConstraint('users', {
        fields: ['status'],
        type: 'check',
        name: 'users_status_check',
        where: {
          status: ['ACTIVE', 'INACTIVE'],
        },
        transaction,
      });

      await queryInterface.createTable(
        'qr_credentials',
        {
          id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          credential_uuid: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
          },
          user_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'ACTIVE',
          },
          issued_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          revoked_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction },
      );

      await queryInterface.addConstraint('qr_credentials', {
        fields: ['status'],
        type: 'check',
        name: 'qr_credentials_status_check',
        where: {
          status: ['ACTIVE', 'REVOKED', 'EXPIRED'],
        },
        transaction,
      });
      await queryInterface.addIndex('qr_credentials', ['user_id', 'status'], {
        name: 'qr_credentials_user_status_idx',
        transaction,
      });
      await queryInterface.addIndex('qr_credentials', ['expires_at'], {
        name: 'qr_credentials_expires_at_idx',
        transaction,
      });
      await queryInterface.sequelize.query(
        `
          CREATE UNIQUE INDEX qr_credentials_one_active_per_user_idx
          ON "qr_credentials" ("user_id")
          WHERE "status" = 'ACTIVE'
        `,
        { transaction },
      );

      await queryInterface.createTable(
        'qr_presentations',
        {
          id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          jti: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
          },
          credential_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            references: { model: 'qr_credentials', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          consumed_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction },
      );
      await queryInterface.addIndex(
        'qr_presentations',
        ['credential_id', 'expires_at'],
        {
          name: 'qr_presentations_credential_expires_idx',
          transaction,
        },
      );
      await queryInterface.addIndex(
        'qr_presentations',
        ['expires_at', 'consumed_at'],
        {
          name: 'qr_presentations_expiry_consumed_idx',
          transaction,
        },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('qr_presentations', { transaction });
      await queryInterface.dropTable('qr_credentials', { transaction });

      await queryInterface.removeConstraint('users', 'users_role_check', {
        transaction,
      });
      await queryInterface.removeConstraint('users', 'users_factory_id_check', {
        transaction,
      });
      await queryInterface.removeConstraint('users', 'users_status_check', {
        transaction,
      });
      await queryInterface.changeColumn(
        'users',
        'employee_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          unique: true,
        },
        { transaction },
      );
      if (
        (
          await queryInterface.describeTable('users', {
            transaction,
          })
        ).factory_id
      ) {
        await queryInterface.removeColumn('users', 'factory_id', { transaction });
      }
      await queryInterface.changeColumn(
        'users',
        'full_name',
        {
          type: Sequelize.STRING(150),
          allowNull: true,
        },
        { transaction },
      );
    });
  },
};
