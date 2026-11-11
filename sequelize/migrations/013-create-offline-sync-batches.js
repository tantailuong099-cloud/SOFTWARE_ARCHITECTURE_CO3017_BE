'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('offline_sync_batches', {
        batch_id       : { type : Sequelize.STRING, primaryKey : true, allowNull : false },
        station_id     : { type : Sequelize.STRING, allowNull : false },
        payload_digest : { type : Sequelize.STRING(64), allowNull : false },
        event_count    : { type : Sequelize.INTEGER, allowNull : false },
        results_json   : { type : Sequelize.JSONB, allowNull : false },
        created_at     : { type : Sequelize.DATE, allowNull : false, defaultValue : Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at     : { type : Sequelize.DATE, allowNull : false, defaultValue : Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction });

      await queryInterface.addColumn('access_events', 'event_source', {
        type : Sequelize.STRING(20), allowNull : false, defaultValue : 'ONLINE',
      }, { transaction });
      await queryInterface.addColumn('access_events', 'offline_event_digest', {
        type : Sequelize.STRING(64), allowNull : true,
      }, { transaction });
      await queryInterface.addColumn('access_events', 'offline_batch_id', {
        type : Sequelize.STRING, allowNull : true,
      }, { transaction });
      await queryInterface.addColumn('access_events', 'offline_policy_snapshot_id', {
        type : Sequelize.STRING, allowNull : true,
      }, { transaction });
      await queryInterface.addColumn('access_events', 'offline_journal_sequence', {
        type : Sequelize.BIGINT, allowNull : true,
      }, { transaction });
      await queryInterface.addColumn('access_events', 'offline_evidence_signature', {
        type : Sequelize.TEXT, allowNull : true,
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE access_events ADD CONSTRAINT access_events_source_check
        CHECK (event_source IN ('ONLINE', 'OFFLINE_EDGE'))
      `, { transaction });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX access_events_offline_journal_unique
        ON access_events (station_id, offline_journal_sequence)
        WHERE event_source = 'OFFLINE_EDGE'
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('DROP INDEX access_events_offline_journal_unique', { transaction });
      await queryInterface.removeConstraint('access_events', 'access_events_source_check', { transaction });
      for (const column of [
        'offline_evidence_signature', 'offline_journal_sequence', 'offline_policy_snapshot_id',
        'offline_batch_id', 'offline_event_digest', 'event_source',
      ]) {
        await queryInterface.removeColumn('access_events', column, { transaction });
      }
      await queryInterface.dropTable('offline_sync_batches', { transaction });
    });
  },
};
