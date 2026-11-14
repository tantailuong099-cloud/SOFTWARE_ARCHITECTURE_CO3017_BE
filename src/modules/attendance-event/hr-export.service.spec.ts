import { Op } from 'sequelize';
import { HrExportService } from './hr-export.service';
import { AccessEventModel } from './model/access-event.model';

jest.mock('@nestjs/sequelize', () => ({ InjectModel: () => () => undefined }));

describe('HR export preview', () => {
  it.each([
    ['2024-02', '2024-03-01T00:00:00.000Z'],
    ['2026-12', '2027-01-01T00:00:00.000Z'],
  ])('selects only the UTC reporting month %s and labels the mock receipt', async (period, nextMonth) => {
    const start = new Date(`${period}-01T00:00:00.000Z`);
    const end = new Date(nextMonth);
    const findAll = jest.fn().mockResolvedValue([]);
    const service = new HrExportService({ findAll } as unknown as typeof AccessEventModel);
    const result = await service.exportHRBatch({ reportingPeriod: period });

    expect(findAll).toHaveBeenCalledWith({
      where: { serverTimestamp: { [Op.gte]: start, [Op.lt]: end } },
      order: [['serverTimestamp', 'ASC']],
    });
    expect(result).toMatchObject({
      status: 'MOCK_ACKNOWLEDGED',
      deliveryMode: 'SIMULATED',
      mockAcknowledgementReceipt: expect.stringMatching(/^HR-MOCK-/),
      preparedAt: expect.any(Date),
    });
    expect(result).not.toHaveProperty('exportedAt');
    expect(result).not.toHaveProperty('acknowledgementReceipt');
  });
});
