import type { IProviderAdapter } from '../providers/interface.js';

class ProviderRegistry {
  private readonly adapters: Map<string, IProviderAdapter> = new Map();
  private defaultProviderId: string | null = null;

  register(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
    if (!this.defaultProviderId) {
      this.defaultProviderId = adapter.id;
    }
  }

  unregister(id: string): boolean {
    const deleted = this.adapters.delete(id);
    if (deleted && this.defaultProviderId === id) {
      const first = this.adapters.keys().next();
      this.defaultProviderId = first.done ? null : first.value;
    }
    return deleted;
  }

  get(id: string): IProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  getDefault(): IProviderAdapter | undefined {
    if (!this.defaultProviderId) return undefined;
    return this.adapters.get(this.defaultProviderId);
  }

  setDefault(id: string): void {
    if (!this.adapters.has(id)) {
      throw new Error(`Provider '${id}' is not registered`);
    }
    this.defaultProviderId = id;
  }

  list(): IProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  listIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  size(): number {
    return this.adapters.size;
  }
}

export { ProviderRegistry };
