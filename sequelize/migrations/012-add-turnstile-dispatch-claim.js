'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('access_events', 'dispatch_claimed_at', {
      type : Sequelize.DATE, allowNull : true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('access_events', 'dispatch_claimed_at');
  },
};
