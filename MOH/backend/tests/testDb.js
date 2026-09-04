const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

/**
 * Starts a fresh in-memory MongoDB instance and connects mongoose to it.
 * Call from a `beforeAll` in each integration test file.
 *
 * NOTE ON RUNNING THESE TESTS: mongodb-memory-server downloads a real
 * MongoDB binary the first time it runs (cached afterward under
 * ~/.cache/mongodb-binaries). This needs outbound access to
 * https://fastdl.mongodb.org. If your CI/sandbox blocks that domain,
 * either allow it, pre-seed the binary cache as a build step, or point
 * MONGOMS_DOWNLOAD_URL at an internal mirror — see mongodb-memory-server's
 * docs. `npm test` (unit tests only) never needs any of this.
 */
async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { autoIndex: true });
}

async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
}

/** Clears all collections between tests without tearing down the connection — much faster than a full restart per test. */
async function clearTestDb() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = { startTestDb, stopTestDb, clearTestDb };
