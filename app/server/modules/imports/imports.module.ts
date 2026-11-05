import { Module } from '@nestjs/common';
import { BerthPlanController, InventoryController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({ controllers: [BerthPlanController, InventoryController], providers: [ImportsService], exports: [ImportsService] })
export class ImportsModule {}
