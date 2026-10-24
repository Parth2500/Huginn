import { Injectable } from '@angular/core';
import { Chat, ChatMessage } from 'src/app/models/chat.interface';

/** A send waiting for the server's acknowledgement. Survives reloads. */
export interface OutboxEntry {
  clientMessageId: string;
  /** Exactly one of these: a saved chat, or a person (the first message of a direct chat). */
  chatId?: number;
  toUserId?: number;
  text: string;
  createdAt: string;
  /** The server refused it, and why: shown with Retry and Delete instead of sending again. */
  failed?: string;
}

const VERSION = 1;

/**
 * The device's copy of the signed-in person's chats (architecture.md §6): chats, recent messages
 * and how much of each chat's history it holds, the outbox, and the last applied update sequence
 * number, in one IndexedDB database per account.
 *
 * Every call degrades to a no-op when IndexedDB isn't available (private windows in some
 * browsers), so the app still works, just without the offline cache.
 */
@Injectable({ providedIn: 'root' })
export class LocalDb {
  private db: Promise<IDBDatabase | null> = Promise.resolve(null);
  private name: string | null = null;

  open(userId: number) {
    const name = `huginn-${userId}`;
    if (this.name === name) {
      return;
    }
    this.close();
    this.name = name;
    this.db = openDatabase(name);
  }

  close() {
    void this.db.then((db) => db?.close());
    this.db = Promise.resolve(null);
    this.name = null;
  }

  /** Deletes this account's local data (on sign-out). */
  async destroy(userId: number) {
    this.close();
    if (typeof indexedDB !== 'undefined') {
      await settle(indexedDB.deleteDatabase(`huginn-${userId}`));
    }
  }

  async getSeq(): Promise<number | null> {
    return (await this.get<{ value: number }>('kv', 'seq'))?.value ?? null;
  }

  setSeq(seq: number) {
    return this.put('kv', { key: 'seq', value: seq });
  }

  async getDrafts(): Promise<Record<string, string>> {
    return (await this.get<{ value: Record<string, string> }>('kv', 'drafts'))?.value ?? {};
  }

  setDrafts(drafts: Record<string, string>) {
    return this.put('kv', { key: 'drafts', value: drafts });
  }

  async getChats(): Promise<Chat[]> {
    return this.all<Chat>('chats');
  }

  putChats(chats: Chat[]) {
    return this.write('chats', (store) => chats.forEach((chat) => store.put(chat)));
  }

  replaceChats(chats: Chat[]) {
    return this.write(['chats', 'messages', 'history'], (store, tx) => {
      store.clear();
      chats.forEach((chat) => store.put(chat));
      // A full reload means the device may have missed messages: start their history fresh.
      tx.objectStore('messages').clear();
      tx.objectStore('history').clear();
    });
  }

  async getMessages(chatId: number): Promise<ChatMessage[]> {
    const db = await this.db;
    if (!db) {
      return [];
    }
    const index = db.transaction('messages').objectStore('messages').index('chatId');
    return (await settle(index.getAll(chatId))) ?? [];
  }

  putMessages(messages: ChatMessage[]) {
    return this.write('messages', (store) => messages.forEach((m) => store.put(m)));
  }

  /** Removes a chat's messages up to and including `upTo` (cleared or deleted chats). */
  deleteMessages(chatId: number, upTo: number) {
    return this.write('messages', (store) => {
      const cursor = store.index('chatId').openCursor(IDBKeyRange.only(chatId));
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row) {
          if ((row.value as ChatMessage).id <= upTo) {
            row.delete();
          }
          row.continue();
        }
      };
    });
  }

  deleteMessageIds(ids: number[]) {
    return this.write('messages', (store) => ids.forEach((id) => store.delete(id)));
  }

  async getHasMore(chatId: number): Promise<boolean | null> {
    return (await this.get<{ hasMore: boolean }>('history', chatId))?.hasMore ?? null;
  }

  /** Whether older messages exist on the server beyond what this device holds. */
  setHasMore(chatId: number, hasMore: boolean) {
    return this.put('history', { chatId, hasMore });
  }

  getOutbox(): Promise<OutboxEntry[]> {
    return this.all<OutboxEntry>('outbox');
  }

  putOutbox(entry: OutboxEntry) {
    return this.put('outbox', entry);
  }

  deleteOutbox(clientMessageId: string) {
    return this.write('outbox', (store) => store.delete(clientMessageId));
  }

  private async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.db;
    if (!db) {
      return undefined;
    }
    return settle<T>(db.transaction(storeName).objectStore(storeName).get(key));
  }

  private async all<T>(storeName: string): Promise<T[]> {
    const db = await this.db;
    if (!db) {
      return [];
    }
    return (await settle<T[]>(db.transaction(storeName).objectStore(storeName).getAll())) ?? [];
  }

  private put(storeName: string, value: unknown) {
    return this.write(storeName, (store) => store.put(value));
  }

  private async write(
    storeNames: string | string[],
    work: (store: IDBObjectStore, tx: IDBTransaction) => void,
  ): Promise<void> {
    const db = await this.db;
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeNames, 'readwrite');
        const first = Array.isArray(storeNames) ? storeNames[0] : storeNames;
        work(tx.objectStore(first), tx);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => resolve();
      } catch {
        resolve(); // the database was closed mid-way (sign-out); nothing to keep
      }
    });
  }
}

function openDatabase(name: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('kv', { keyPath: 'key' });
      db.createObjectStore('chats', { keyPath: 'id' });
      db.createObjectStore('messages', { keyPath: 'id' }).createIndex('chatId', 'chatId');
      db.createObjectStore('history', { keyPath: 'chatId' });
      db.createObjectStore('outbox', { keyPath: 'clientMessageId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function settle<T>(request: IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => resolve(undefined);
  });
}
