import { GateStationService } from './gate-station.service';
import { GateStationModel, GateStationStatus, GateDirection } from './model/gate-station.model';
import { FactoryId } from '../users/model/user.model';

jest.mock('@nestjs/sequelize', () => ({ InjectModel: () => () => undefined }));

describe('Station status compatibility', () => {
  it.each([GateStationStatus.INACTIVE, GateStationStatus.DISABLED])(
    'persists %s as INACTIVE and refuses access',
    async (status) => {
      const station = {
        stationCode: 'TEST-GATE',
        name: 'Fixture',
        location: 'Fixture',
        factoryId: FactoryId.BINH_DUONG,
        direction: GateDirection.ENTRY,
        status: GateStationStatus.ACTIVE,
        save: jest.fn(),
      };
      const findOne = jest.fn().mockResolvedValue(station);
      const service = new GateStationService({ findOne } as unknown as typeof GateStationModel);

      expect(await service.updateStatus(station.stationCode, status)).toMatchObject({
        status: GateStationStatus.INACTIVE,
      });
      expect(station.save).toHaveBeenCalled();
      await expect(service.validateActiveStation(station.stationCode)).rejects.toThrow('STATION_INACTIVE');
    },
  );
});
