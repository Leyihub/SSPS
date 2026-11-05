import { Module } from '@nestjs/common';
import { DataIssueController, VoyageController } from './voyage.controller';
import { VoyageService } from './voyage.service';
import { IssueScanService } from './issue-scan.service';

@Module({ controllers: [VoyageController, DataIssueController], providers: [VoyageService, IssueScanService], exports: [VoyageService, IssueScanService] })
export class VoyageModule {}
