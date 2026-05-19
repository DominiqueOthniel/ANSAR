import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ThirdParty } from '../entities/third-party.entity';
import { CreateThirdPartyDto } from './dto/create-third-party.dto';
import { UpdateThirdPartyDto } from './dto/update-third-party.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class ThirdPartiesService {
  constructor(
    @InjectRepository(ThirdParty)
    private readonly thirdPartyRepository: Repository<ThirdParty>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateThirdPartyDto, actor?: AuditActor): Promise<ThirdParty> {
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
    const saved = await this.thirdPartyRepository.save(thirdParty);
    await this.auditLogsService.log({
      module: 'third-parties',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Création fiche ${saved.type} ${saved.nom}`,
      afterData: saved as unknown as Record<string, unknown>,
      actor,
    });
    return saved;
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

  async update(id: string, dto: UpdateThirdPartyDto, actor?: AuditActor): Promise<ThirdParty> {
    const before = await this.findOne(id);
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
    const after = await this.findOne(id);
    await this.auditLogsService.log({
      module: 'third-parties',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification fiche ${after.type} ${after.nom}`,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }

  async remove(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.findOne(id);
    await this.thirdPartyRepository.delete(id);
    await this.auditLogsService.log({
      module: 'third-parties',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression fiche ${before.type} ${before.nom}`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }
}
