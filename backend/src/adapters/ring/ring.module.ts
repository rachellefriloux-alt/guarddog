import { Module } from '@nestjs/common';
import { RingAdapter } from './ring.adapter';

@Module({
  providers: [RingAdapter],
  exports: [RingAdapter],
})
export class RingModule {}
