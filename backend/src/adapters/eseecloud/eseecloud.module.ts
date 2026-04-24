import { Module } from '@nestjs/common';
import { EseecloudAdapter } from './eseecloud.adapter';

@Module({
  providers: [EseecloudAdapter],
  exports: [EseecloudAdapter],
})
export class EseecloudModule {}
