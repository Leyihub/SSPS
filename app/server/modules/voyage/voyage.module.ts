import { Module } from '@nestjs/common';
import { DataIssueController, VoyageController } from './voyage.controller';
import { VoyageService } from './voyage.service';

@Module({ controllers: [VoyageController, DataIssueController], providers: [VoyageService], exports: [VoyageService] })
export class VoyageModule {}
