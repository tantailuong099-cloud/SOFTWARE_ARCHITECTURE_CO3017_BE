'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('access_events', {
        event_id           : { type : Sequelize.STRING, allowNull : false, primaryKey : true },
        request_id         : { type : Sequelize.STRING, allowNull : false, unique : true },
        employee_id        : { type : Sequelize.STRING, allowNull : true },
        employee_name      : { type : Sequelize.STRING, allowNull : true },
        station_id         : { type : Sequelize.STRING, allowNull : false },
        factory_id         : { type : Sequelize.STRING(20), allowNull : false },
        direction          : { type : Sequelize.STRING(10), allowNull : false },
        access_decision    : { type : Sequelize.STRING(20), allowNull : false },
        denial_reason      : { type : Sequelize.STRING, allowNull : true },
        controller_outcome : { type : Sequelize.STRING(30), allowNull : false, defaultValue : 'CONTROLLER_PENDING' },
        server_timestamp   : { type : Sequelize.DATE, allowNull : false },
        device_timestamp   : { type : Sequelize.DATE, allowNull : true },
        correlation_id     : { type : Sequelize.STRING, allowNull : false },
        policy_version     : { type : Sequelize.STRING, allowNull : false, defaultValue : 'v1.0' },
        created_at         : { type : Sequelize.DATE, allowNull : false, defaultValue : Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at         : { type : Sequelize.DATE, allowNull : false, defaultValue : Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE "access_events"
        ADD CONSTRAINT access_events_factory_check CHECK (factory_id IN ('BINH_DUONG', 'LONG_AN')),
        ADD CONSTRAINT access_events_direction_check CHECK (direction IN ('ENTRY', 'EXIT')),
        ADD CONSTRAINT access_events_decision_check CHECK (access_decision IN ('APPROVED', 'DENIED')),
        ADD CONSTRAINT access_events_controller_check CHECK (controller_outcome IN (
          'CONTROLLER_CONFIRMED', 'CONTROLLER_FAILED', 'CONTROLLER_UNKNOWN', 'CONTROLLER_PENDING', 'NOT_APPLICABLE'
        ))
      `, { transaction });

      await queryInterface.addIndex('access_events', ['station_id', 'server_timestamp'], {
        name : 'access_events_station_time_idx', transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('access_events');
  },
};
