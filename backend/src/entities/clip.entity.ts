import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class Clip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Column()
  path: string;

  @Column({ type: 'int', nullable: true })
  durationMs: number;

  @Column({ type: 'int', nullable: true })
  sizeBytes: number;

  @Column('simple-json', { nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}
