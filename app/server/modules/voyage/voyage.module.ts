import { Module } from '@nestjs/common';
import { VoyageController } from './voyage.controller';
import { VoyageService } from './voyage.service';

@Module({ controllers: [VoyageController], providers: [VoyageService], exports: [VoyageService] })
export class VoyageModule {}
