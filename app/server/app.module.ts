import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { PortsModule } from './modules/ports/ports.module';
import { PredictionModule } from './modules/prediction/prediction.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { VoyageModule } from './modules/voyage/voyage.module';
import { MasterModule } from './modules/master/master.module';
import { AdminModule } from './modules/admin/admin.module';
import { ImportsModule } from './modules/imports/imports.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot(),
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    PortsModule,
    PredictionModule,
    CapacityModule,
    VoyageModule,
    MasterModule,
    ImportsModule,
    AdminModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
