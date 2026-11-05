import { Module } from '@nestjs/common';
import { ImportsModule } from '../imports/imports.module';
import { MasterModule } from '../master/master.module';
import { VoyageModule } from '../voyage/voyage.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CompatService } from './compat.service';
import { JobsAutomation } from './jobs.automation';

@Module({ imports: [VoyageModule, ImportsModule, MasterModule], controllers: [AdminController], providers: [AdminService, CompatService, JobsAutomation], exports: [AdminService, CompatService] })
export class AdminModule {}
