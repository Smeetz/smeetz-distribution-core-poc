import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 8000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`distribution-core spike listening on :${port} (tiqets: /v2/*, gyg: /1/*)`);
}
bootstrap();
