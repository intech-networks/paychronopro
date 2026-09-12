import pg from 'pg';
import { config, databaseSchemaIdentifier } from '../config.js';

class ApplicationSchemaPool extends pg.Pool {
  connect(callback) {
    if (callback) {
      return super.connect((error, client, release) => {
        if (error) return callback(error);
        return client.query(`SET search_path TO ${databaseSchemaIdentifier}`, (initializationError) => {
          if (initializationError) {
            release(initializationError);
            return callback(initializationError);
          }
          return callback(null, client, release);
        });
      });
    }
    return super.connect().then(async (client) => {
      try {
        await client.query(`SET search_path TO ${databaseSchemaIdentifier}`);
        return client;
      } catch (error) {
        client.release(error);
        throw error;
      }
    });
  }
}

const poolOptions = { connectionString: config.databaseUrl };
if (config.databaseSsl) poolOptions.ssl = { rejectUnauthorized: true };

export const pool = new ApplicationSchemaPool(poolOptions);

pool.on('error', (error) => console.error('Unexpected PostgreSQL error', error));
