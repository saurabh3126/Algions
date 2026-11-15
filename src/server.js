import { app } from './app.js';
import { connect, client } from './db.js';
await connect();
const server = app.listen(Number(process.env.PORT || 4000), '127.0.0.1', () => console.log('Algions API listening on http://127.0.0.1:' + (process.env.PORT || 4000)));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(async () => { await client.close(); process.exit(0); }));
