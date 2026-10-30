/**
 * SQLite database backend for Kaetram (Pocket Legends edition).
 *
 * A lightweight alternative to MongoDB for small/local game servers.
 * Uses Node.js' built-in `node:sqlite` module (zero external dependencies).
 *
 * Data model: mongo-like documents stored in a single table
 *   documents(collection TEXT, key TEXT, data TEXT JSON)
 * where `key` is the username for player_* collections, `identifier`
 * for guilds, and `ip` for ipbans — mirroring the query patterns of
 * the MongoDB backend.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import log from '@kaetram/common/util/log';

export interface SqliteOptions {
    /** Absolute or relative path to the database file. */
    path: string;
}

/** Minimal document-store wrapper around the raw SQLite handle. */
export class SqliteStore {
    private db: DatabaseSync;

    public constructor(options: SqliteOptions) {
        let dir = path.dirname(path.resolve(options.path));

        // Ensure the parent directory exists (e.g. `data/database/`).
        fs.mkdirSync(dir, { recursive: true });

        this.db = new DatabaseSync(options.path);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS documents (
                collection TEXT NOT NULL,
                key TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (collection, key)
            );
            CREATE TABLE IF NOT EXISTS documents_id (
                collection TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (collection, id)
            );
        `);

        log.notice(`SQLite database opened at ${options.path}.`);
    }

    /** Upserts a document identified by `key` inside a collection. */
    public put(collection: string, key: string, data: unknown): void {
        let stmt = this.db.prepare(
            `INSERT INTO documents (collection, key, data) VALUES (?, ?, ?)
             ON CONFLICT(collection, key) DO UPDATE SET data = excluded.data`
        );

        stmt.run(collection, key, JSON.stringify(data));
    }

    /** Gets a single document by key, or undefined. */
    public get<T = Record<string, unknown>>(collection: string, key: string): T | undefined {
        let stmt = this.db.prepare('SELECT data FROM documents WHERE collection = ? AND key = ?'),
            row = stmt.get(collection, key) as { data: string } | undefined;

        return row ? (JSON.parse(row.data) as T) : undefined;
    }

    /** Returns all documents in a collection. */
    public all<T = Record<string, unknown>>(collection: string): T[] {
        let stmt = this.db.prepare('SELECT data FROM documents WHERE collection = ?'),
            rows = stmt.all(collection) as { data: string }[];

        return rows.map((row) => JSON.parse(row.data) as T);
    }

    /** Removes a document by key. Returns whether a row was deleted. */
    public remove(collection: string, key: string): boolean {
        let stmt = this.db.prepare('DELETE FROM documents WHERE collection = ? AND key = ?');

        return stmt.run(collection, key).changes > 0;
    }

    /** Counts documents in a collection. */
    public count(collection: string): number {
        let stmt = this.db.prepare('SELECT COUNT(*) as c FROM documents WHERE collection = ?'),
            row = stmt.get(collection) as { c: number };

        return row.c;
    }

    /** Gets a document by an arbitrary id inside the id table (reset tokens etc.). */
    public getById<T = Record<string, unknown>>(collection: string, id: string): T | undefined {
        let stmt = this.db.prepare('SELECT data FROM documents_id WHERE collection = ? AND id = ?'),
            row = stmt.get(collection, id) as { data: string } | undefined;

        return row ? (JSON.parse(row.data) as T) : undefined;
    }

    /** Upserts a document by arbitrary id. */
    public putById(collection: string, id: string, data: unknown): void {
        let stmt = this.db.prepare(
            `INSERT INTO documents_id (collection, id, data) VALUES (?, ?, ?)
             ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data`
        );

        stmt.run(collection, id, JSON.stringify(data));
    }
}
