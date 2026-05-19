import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ThirdParty } from '../entities/third-party.entity';
import { CreateThirdPartyDto } from './dto/create-third-party.dto';
import { UpdateThirdPartyDto } from './dto/update-third-party.dto';

@Injectable()
export class ThirdPartiesService {
  constructor(
    @InjectRepository(ThirdParty)
    private readonly thirdPartyRepository: Repository<ThirdParty>,
  ) {}

  async create(dto: CreateThirdPartyDto): Promise<ThirdParty> {
    const { plafondCredit, sexe, segmentClient, ville, dateNaissance, ...rest } = dto;
    const payload: DeepPartial<ThirdParty> = {
      id: uuidv4(),
      ...rest,
      sexe: sexe ?? undefined,
      segmentClient: segmentClient ?? undefined,
      ville: ville?.trim() || undefined,
      dateNaissance: dateNaissance || undefined,
    };
    if (plafondCredit != null) {
      payload.plafondCredit = String(plafondCredit);
    }
    const thirdParty = this.thirdPartyRepository.create(payload);
    return this.thirdPartyRepository.save(thirdParty);
  }

  async findAll(): Promise<ThirdParty[]> {
    return this.thirdPartyRepository.find({
      order: { nom: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ThirdParty> {
    const thirdParty = await this.thirdPartyRepository.findOne({ where: { id } });
    if (!thirdParty) throw new NotFoundException(`Tier ${id} introuvable`);
    return thirdParty;
  }

  async update(id: string, dto: UpdateThirdPartyDto): Promise<ThirdParty> {
    await this.findOne(id);
    const { plafondCredit, sexe, segmentClient, ville, dateNaissance, ...rest } = dto;
    const patch: Partial<ThirdParty> = { ...rest };
    if ('plafondCredit' in dto) {
      if (plafondCredit === null) {
        (patch as { plafondCredit?: string | null }).plafondCredit = null;
      } else if (plafondCredit !== undefined) {
        patch.plafondCredit = String(plafondCredit);
      }
    }
    if ('sexe' in dto) patch.sexe = sexe ?? undefined;
    if ('segmentClient' in dto) patch.segmentClient = segmentClient ?? undefined;
    if ('ville' in dto) patch.ville = ville?.trim() || undefined;
    if ('dateNaissance' in dto) patch.dateNaissance = dateNaissance || undefined;
    if (Object.keys(patch).length) {
      await this.thirdPartyRepository.update(id, patch);
    }
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.thirdPartyRepository.delete(id);
  }
}
