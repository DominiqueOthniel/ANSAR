import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Truck } from '../entities/truck.entity';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { uploadImageFromDataUrl } from '../utils/supabase-upload';

@Injectable()
export class TrucksService {
  constructor(
    @InjectRepository(Truck)
    private readonly truckRepository: Repository<Truck>,
  ) {}

  private normalizeImmatriculation(raw?: string): string {
    return (raw ?? '').trim().replace(/\s+/g, '').toUpperCase();
  }

  private normalizeTruckPayload(
    dto: CreateTruckDto | UpdateTruckDto,
    current?: Truck,
  ): Partial<Truck> {
    const type = dto.type ?? current?.type;
    const immat = this.normalizeImmatriculation(dto.immatriculation ?? current?.immatriculation);
    const nom =
      dto.nom !== undefined ? dto.nom.trim() || undefined : current?.nom?.trim() || undefined;
    const remorqueImmat = this.normalizeImmatriculation(
      dto.remorqueImmatriculation ?? current?.remorqueImmatriculation,
    );

    if (type === 'tracteur') {
      const sousType = dto.sousType ?? (remorqueImmat ? 'tracteur_jumele' : 'tracteur_seul');
      let finalImmat = immat;
      if (sousType === 'tracteur_jumele' && remorqueImmat) {
        const suffix = `-${remorqueImmat}`;
        // Le client peut déjà envoyer « TRACT-REMORQ » + remorque : ne pas recoller une 2e fois.
        finalImmat = immat.endsWith(suffix) ? immat : `${immat}-${remorqueImmat}`;
      }
      return {
        ...dto,
        nom,
        immatriculation: finalImmat,
        sousType,
        remorqueImmatriculation:
          sousType === 'tracteur_jumele' ? remorqueImmat || undefined : undefined,
      } as Partial<Truck>;
    }

    // Remorqueuse: sous-type cohérent et immat simple.
    return {
      ...dto,
      nom,
      immatriculation: immat,
      sousType: 'remorque_seule',
      remorqueImmatriculation: undefined,
    } as Partial<Truck>;
  }

  async create(dto: CreateTruckDto): Promise<Truck> {
    const id = uuidv4();

    let photo = dto.photo;
    if (dto.photo?.startsWith('data:image/')) {
      const bucket = process.env.SUPABASE_BUCKET_TRUCKS || 'truck-photos';
      const path = `trucks/${id}`;
      photo = await uploadImageFromDataUrl(bucket, path, dto.photo);
    }

    const normalized = this.normalizeTruckPayload(dto);
    const truck = this.truckRepository.create({
      id,
      ...normalized,
      photo,
    });
    return this.truckRepository.save(truck);
  }

  async findAll(): Promise<Truck[]> {
    return this.truckRepository.find({
      relations: ['proprietaire', 'chauffeur'],
      order: { immatriculation: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Truck> {
    const truck = await this.truckRepository.findOne({
      where: { id },
      relations: ['proprietaire', 'chauffeur'],
    });
    if (!truck) throw new NotFoundException(`Camion ${id} introuvable`);
    return truck;
  }

  async update(id: string, dto: UpdateTruckDto): Promise<Truck> {
    const current = await this.findOne(id);
    let patch: Partial<Truck> = this.normalizeTruckPayload(dto, current);

    if (dto.photo && dto.photo.startsWith('data:image/')) {
      const bucket = process.env.SUPABASE_BUCKET_TRUCKS || 'truck-photos';
      const path = `trucks/${id}`;
      const uploaded = await uploadImageFromDataUrl(bucket, path, dto.photo);
      patch = { ...patch, photo: uploaded };
    }

    await this.truckRepository.update(id, patch);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.truckRepository.delete(id);
  }
}
