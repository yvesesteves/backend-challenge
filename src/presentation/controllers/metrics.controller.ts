import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrometheusMetricsService } from '../../infrastructure/observability/prometheus-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: PrometheusMetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.metrics.getContentType());
    res.send(await this.metrics.getMetricsText());
  }
}