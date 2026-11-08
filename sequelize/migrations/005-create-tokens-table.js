'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('tokens')) {
      await queryInterface.createTable('tokens', {
        id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        token_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
          unique: true,
        },
        type: {
          type: Sequelize.ENUM('ACCESS', 'REFRESH'),
          allowNull: false,
        },
        revoked: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });
      await queryInterface.addIndex('tokens', ['user_id', 'type', 'revoked']);
      await queryInterface.addIndex('tokens', ['expires_at']);
    }

    const columns = await queryInterface.describeTable('users');
    if (columns.token_version) {
      await queryInterface.removeColumn('users', 'token_version');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('tokens');
    const columns = await queryInterface.describeTable('users');
    if (!columns.token_version) {
      await queryInterface.addColumn('users', 'token_version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },
};
