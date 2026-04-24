import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export type DeviceType = 'ESEECLOUD' | 'RING';

@Entity()
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  type: DeviceType;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  room: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ nullable: true })
  streamUrl: string;

  @Column('simple-json', { nullable: true })
  metadata: any;
}
