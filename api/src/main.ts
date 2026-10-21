import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { appOrigins } from './auth/session-cookie';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Profile photos. At scale these belong in object storage behind a CDN (see docs/SCALING.md).
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads/',
    maxAge: '7d',
    immutable: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe());
  const config = new DocumentBuilder()
    .setTitle('Huginn')
    .setDescription(
      'Huginn API: REST endpoints. Realtime events are documented in docs/huginn/architecture.md.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  // The app is served from the same origin (through a proxy), so this only matters for tools.
  app.enableCors({ origin: appOrigins(), credentials: true });
  await app.listen(3000);
}
void bootstrap();
