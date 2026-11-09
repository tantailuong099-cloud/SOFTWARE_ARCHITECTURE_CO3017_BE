'use strict';

const stations = [
  {
    station_code: 'BD-GATE-01',
    name: 'Binh Duong - Main Entrance',
    factory_id: 'BINH_DUONG',
    direction: 'ENTRY',
    location: 'Main gate, entry lane',
    status: 'ACTIVE',
  },
  {
    station_code: 'BD-GATE-02',
    name: 'Binh Duong - Main Exit',
    factory_id: 'BINH_DUONG',
    direction: 'EXIT',
    location: 'Main gate, exit lane',
    status: 'ACTIVE',
  },
  {
    station_code: 'BD-GATE-03',
    name: 'Binh Duong - Auxiliary Entry',
    factory_id: 'BINH_DUONG',
    direction: 'ENTRY',
    location: 'Area A, auxiliary lane',
    status: 'INACTIVE',
  },
  {
    station_code: 'BD-GATE-04',
    name: 'Binh Duong - Auxiliary Exit',
    factory_id: 'BINH_DUONG',
    direction: 'EXIT',
    location: 'Area A, auxiliary exit lane',
    status: 'INACTIVE',
  },
  {
    station_code: 'LA-GATE-01',
    name: 'Long An - Gate A Entrance',
    factory_id: 'LONG_AN',
    direction: 'ENTRY',
    location: 'Gate A, entry lane',
    status: 'ACTIVE',
  },
  {
    station_code: 'LA-GATE-02',
    name: 'Long An - Gate A Exit',
    factory_id: 'LONG_AN',
    direction: 'EXIT',
    location: 'Gate A, exit lane',
    status: 'ACTIVE',
  },
  {
    station_code: 'LA-GATE-03',
    name: 'Long An - Auxiliary Entry',
    factory_id: 'LONG_AN',
    direction: 'ENTRY',
    location: 'Area B, auxiliary lane',
    status: 'INACTIVE',
  },
  {
    station_code: 'LA-GATE-04',
    name: 'Long An - Auxiliary Exit',
    factory_id: 'LONG_AN',
    direction: 'EXIT',
    location: 'Area B, auxiliary exit lane',
    status: 'INACTIVE',
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'gate_stations',
        {
          id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          station_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
          },
          name: {
            type: Sequelize.STRING(150),
            allowNull: false,
          },
          factory_id: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          direction: {
            type: Sequelize.STRING(10),
            allowNull: false,
          },
          location: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'ACTIVE',
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

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "gate_stations"
          ADD CONSTRAINT "gate_stations_factory_id_check"
            CHECK ("factory_id" IN ('BINH_DUONG', 'LONG_AN')),
          ADD CONSTRAINT "gate_stations_direction_check"
            CHECK ("direction" IN ('ENTRY', 'EXIT')),
          ADD CONSTRAINT "gate_stations_status_check"
            CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
        `,
        { transaction },
      );
      await queryInterface.addIndex('gate_stations', ['factory_id'], {
        name: 'gate_stations_factory_id_idx',
        transaction,
      });
      await queryInterface.addIndex('gate_stations', ['status', 'direction'], {
        name: 'gate_stations_status_direction_idx',
        transaction,
      });

      for (const station of stations) {
        await queryInterface.sequelize.query(
          `
            INSERT INTO "gate_stations"
              ("station_code", "name", "factory_id", "direction", "location", "status", "created_at", "updated_at")
            VALUES
              (:station_code, :name, :factory_id, :direction, :location, :status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT ("station_code") DO UPDATE SET
              "name" = EXCLUDED."name",
              "factory_id" = EXCLUDED."factory_id",
              "direction" = EXCLUDED."direction",
              "location" = EXCLUDED."location",
              "status" = EXCLUDED."status",
              "updated_at" = CURRENT_TIMESTAMP
          `,
          {
            replacements: station,
            transaction,
          },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('gate_stations');
  },
};
