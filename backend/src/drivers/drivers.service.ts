import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Driver } from '../entities/driver.entity';
import { DriverTransaction } from '../entities/driver-transaction.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { uploadImageFromDataUrl } from '../utils/supabase-upload';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(DriverTransaction)
    private readonly transactionRepository: Repository<DriverTransaction>,
  ) {}

  async create(dto: CreateDriverDto): Promise<Driver> {
    const id = uuidv4();

    let photo = dto.photo;
    if (dto.photo?.startsWith('data:image/')) {
      const bucket = process.env.SUPABASE_BUCKET_DRIVERS || 'driver-photos';
      const path = `drivers/${id}`;
      photo = await uploadImageFromDataUrl(bucket, path, dto.photo);
    }

    const driver = this.driverRepository.create({
      id,
      nom: dto.nom,
      prenom: dto.prenom,
      telephone: dto.telephone,
      cni: dto.cni,
      numeroPermis: dto.numeroPermis,
      photo,
    });
    const saved = await this.driverRepository.save(driver);
    if (dto.transactions?.length) {
      const transactions = dto.transactions.map((t) =>
        this.transactionRepository.create({
          id: uuidv4(),
          ...t,
          driverId: saved.id,
        }),
      );
      await this.transactionRepository.save(transactions);
    }
    return this.findOne(saved.id);
  }

  async findAll(): Promise<Driver[]> {
    return this.driverRepository.find({
      relations: ['transactions'],
      order: { nom: 'ASC', prenom: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({
      where: { id },
      relations: ['transactions'],
    });
    if (!driver) throw new NotFoundException(`Chauffeur ${id} introuvable`);
    return driver;
  }

  async update(id: string, dto: UpdateDriverDto): Promise<Driver> {
    await this.findOne(id);
    const { transactions, ...rest } = dto;
    let patch: Partial<Driver> = rest as Partial<Driver>;

    if (dto.photo && dto.photo.startsWith('data:image/')) {
      const bucket = process.env.SUPABASE_BUCKET_DRIVERS || 'driver-photos';
      const path = `drivers/${id}`;
      const uploaded = await uploadImageFromDataUrl(bucket, path, dto.photo);
      patch = { ...patch, photo: uploaded };
    }

    await this.driverRepository.update(id, patch);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.driverRepository.delete(id);
  }
}
