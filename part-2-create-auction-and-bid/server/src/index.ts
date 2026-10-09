import './otel.js';

const { buildApp } = await import('./app.js');
const { createAuctionRealtime } = await import('./realtime.js');
let realtime: ReturnType<typeof createAuctionRealtime>;
const app = buildApp({
  publishAuctionChanged: (event) => realtime.publishAuctionChanged(event),
  getRealtimeStatus: () => realtime.getStatus(),
});
realtime = createAuctionRealtime(app.server, app.log, app.auctionExists);
app.addHook('onClose', async () => realtime.close());
const port = Number(process.env.API_PORT ?? 3102);
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:56379';

try {
  await app.listen({ port });
  void realtime.connectRedis(redisUrl).catch((error) => {
    app.log.error({ err: error }, 'initial Redis realtime connection failed');
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
