import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class RequestStorage {
  private static readonly storage = new AsyncLocalStorage<Map<string, any>>();

  static run(requestId: string, callback: () => void) {
    const store = new Map();
    store.set('requestId', requestId);
    this.storage.run(store, callback);
  }

  static getRequestId(): string | undefined {
    return this.storage.getStore()?.get('requestId');
  }
}
