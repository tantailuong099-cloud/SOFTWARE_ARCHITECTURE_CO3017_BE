'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('access_scan_requests', {
        request_id          : { type : Sequelize.STRING, allowNull : false, primaryKey : true },
        station_id          : { type : Sequelize.STRING, allowNull : false },
        request_fingerprint : { type : Sequelize.STRING(64), allowNull : true },
        result_type         : { type : Sequelize.STRING(20), allowNull : true },
        event_id            : { type : Sequelize.STRING, allowNull : true, unique : true,
                                references : { model : 'access_events', key : 'event_id' }, onDelete : 'RESTRICT' },
        reason_code         : { type : Sequelize.STRING, allowNull : true },
        server_timestamp    : { type : Sequelize.DATE, allowNull : false },
        created_at          : { type : Sequelize.DATE, allowNull : false, defaultValue : Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at          : { type : Sequelize.DATE, allowNull : false, defaultValue : Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE access_scan_requests ADD CONSTRAINT access_scan_requests_result_check
        CHECK (result_type IN ('EVENT_RECORDED', 'REJECTED_NO_EVENT', 'LEGACY'))
      `, { transaction });

      // Preserve Stage 1 request identities even though their QR fingerprints are unavailable.
      await queryInterface.sequelize.query(`
        INSERT INTO access_scan_requests
          (request_id, station_id, request_fingerprint, result_type, event_id,
           reason_code, server_timestamp, created_at, updated_at)
        SELECT request_id, station_id, NULL, 'LEGACY', event_id,
               NULL, server_timestamp, created_at, updated_at
        FROM access_events
        ON CONFLICT (request_id) DO NOTHING
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('access_scan_requests');
  },
};
