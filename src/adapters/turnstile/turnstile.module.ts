import { Module } from '@nestjs/common';
import { TURNSTILE_PORT } from './turnstile.port';
import { TurnstileSimulatorAdapter } from './turnstile-simulator.adapter';

@Module({
  providers: [
    TurnstileSimulatorAdapter,
    {
      provide: TURNSTILE_PORT,
      useExisting: TurnstileSimulatorAdapter,
    },
  ],
  exports: [TURNSTILE_PORT, TurnstileSimulatorAdapter],
})
export class TurnstileModule {}
