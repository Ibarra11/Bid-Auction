import './otel.js';

const { buildApp } = await import('./app.js');
const { createAuctionRealtime } = await import('./realtime.js');
let realtime: ReturnType<typeof createAuctionRealtime>;
const app = buildApp({ publishAuctionChanged: (event) => realtime.publishAuctionChanged(event) });
realtime = createAuctionRealtime(app.server, app.log, app.auctionExists);
app.addHook('onClose', async () => realtime.close());
const port = Number(process.env.API_PORT ?? 3102);

try {
  await app.listen({ port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
