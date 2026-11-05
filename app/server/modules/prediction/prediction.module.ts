import { Module } from '@nestjs/common';
import { PredictionController } from './prediction.controller';
import { VoyageModule } from '../voyage/voyage.module';
import { PredictionService } from './prediction.service';

@Module({ imports: [VoyageModule], controllers: [PredictionController], providers: [PredictionService], exports: [PredictionService] })
export class PredictionModule {}
