import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Public REST endpoints are exposed under /api; internal adapter/AI
  // endpoints keep their own /internal prefix.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'internal/(.*)', method: RequestMethod.ALL }],
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`GuardDog backend listening on ${port}`);
}

bootstrap();

