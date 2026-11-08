'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('users');
    if (!columns.token_version) {
      await queryInterface.addColumn('users', 'token_version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('users');
    if (columns.token_version) {
      await queryInterface.removeColumn('users', 'token_version');
    }
  },
};
