'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
    );
    await queryInterface.removeColumn('users', 'id');
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" ADD COLUMN "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY;',
    );
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users'
            AND column_name = 'username'
        ) THEN
          ALTER TABLE "users" DROP COLUMN "username";
        END IF;
      END
      $$;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" DROP CONSTRAINT "users_pkey";',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" ADD COLUMN "id_uuid" UUID DEFAULT gen_random_uuid();',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" DROP COLUMN "id";',
    );
    await queryInterface.renameColumn('users', 'id_uuid', 'id');
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" ADD PRIMARY KEY ("id");',
    );
    await queryInterface.addColumn('users', 'username', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE "users" SET "username" = "email";',
    );
    await queryInterface.changeColumn('users', 'username', {
      type: Sequelize.STRING(100),
      allowNull: false,
      unique: true,
    });
  },
};
