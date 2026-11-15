import { MongoClient } from 'mongodb';
const client = new MongoClient('mongodb://127.0.0.1:27018/?directConnection=true', { serverSelectionTimeoutMS: 2000 });
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await client.connect();
      const hello = await client.db('admin').command({ hello: 1 });
      if (!hello.setName) {
        try { await client.db('admin').command({ replSetInitiate: { _id: 'routerelay', members: [{ _id: 0, host: '127.0.0.1:27018' }] } }); }
        catch (e) { if (e.code !== 23) throw e; }
      }
      if (hello.isWritablePrimary && hello.setName === 'routerelay') { console.log('Local Algions replica set ready on port 27018'); break; }
      if (attempt === 29) throw new Error('Replica set did not become ready');
    } catch (e) { if (attempt === 29) throw e; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally { await client.close(); }
