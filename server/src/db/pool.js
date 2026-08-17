import pg from 'pg';
import { config } from '../config.js';

class PublicSchemaPool extends pg.Pool {
  connect(callback) {
    if (callback) {
      return super.connect((error, client, release) => {
        if (error) return callback(error);
        return client.query('SET search_path TO public', (initializationError) => {
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
        await client.query('SET search_path TO public');
        return client;
      } catch (error) {
        client.release(error);
        throw error;
      }
    });
  }
}

export const pool = new PublicSchemaPool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : false
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL error', error));
