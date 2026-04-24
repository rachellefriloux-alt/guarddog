import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class Snapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Column()
  path: string;

  @Column('simple-json', { nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}
