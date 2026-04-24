import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('event')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  deviceKey: string;

  @Column()
  type: string;

  @Column({ type: 'float', nullable: true })
  confidence: number;

  @Column('simple-json', { nullable: true })
  bbox: any;

  @Column('simple-json', { nullable: true })
  metadata: any;

  @CreateDateColumn()
  timestamp: Date;
}
