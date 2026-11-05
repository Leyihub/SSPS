import { Module } from '@nestjs/common';
import { VoyageModule } from '../voyage/voyage.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CompatService } from './compat.service';

@Module({ imports: [VoyageModule], controllers: [AdminController], providers: [AdminService, CompatService], exports: [AdminService, CompatService] })
export class AdminModule {}
