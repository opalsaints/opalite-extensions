/**
 * Mapper Registry — lifecycle management for all mappers.
 *
 * Manages initialization, scanning, and cleanup of mappers.
 * Mappers are registered by type and initialized based on page context.
 */

import type { IMapper, MapperContext, MapperType } from './mapper.interface';

export class MapperRegistry {
  private mappers = new Map<string, IMapper>();
  private context: MapperContext;

  constructor(context: MapperContext) {
    this.context = context;
  }

  /**
   * Register a mapper. Does NOT initialize it.
   */
  register(mapper: IMapper): void {
    if (this.mappers.has(mapper.id)) {
      this.context.logger.warning(
        `Mapper "${mapper.id}" already registered — replacing`,
        'MapperRegistry',
      );
      this.mappers.get(mapper.id)!.destroy();
    }
    this.mappers.set(mapper.id, mapper);
    this.context.logger.debug(`Registered mapper: ${mapper.id} (${mapper.type})`, 'MapperRegistry');
  }

  /**
   * Initialize a specific mapper by ID.
   */
  async initMapper(id: string): Promise<void> {
    const mapper = this.mappers.get(id);
    if (!mapper) {
      this.context.logger.error(`Mapper "${id}" not found`, 'MapperRegistry');
      return;
    }

    try {
      await mapper.init(this.context);
      this.context.logger.info(`Initialized mapper: ${id}`, 'MapperRegistry');
    } catch (err) {
      this.context.logger.error(`Failed to init mapper "${id}": ${err}`, 'MapperRegistry');
    }
  }

  /**
   * Initialize all mappers of a specific type.
   */
  async initByType(type: MapperType): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [id, mapper] of this.mappers) {
      if (mapper.type === type) {
        promises.push(this.initMapper(id));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Initialize all registered mappers.
   */
  async initAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [id] of this.mappers) {
      promises.push(this.initMapper(id));
    }
    await Promise.all(promises);
  }

  /**
   * Scan using a specific mapper.
   */
  async scan(id: string): Promise<void> {
    const mapper = this.mappers.get(id);
    if (!mapper) {
      this.context.logger.error(`Mapper "${id}" not found for scan`, 'MapperRegistry');
      return;
    }

    try {
      await mapper.scan();
    } catch (err) {
      this.context.logger.error(`Scan failed for mapper "${id}": ${err}`, 'MapperRegistry');
    }
  }

  /**
   * Scan with all mappers of a specific type.
   */
  async scanByType(type: MapperType): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [, mapper] of this.mappers) {
      if (mapper.type === type) {
        promises.push(mapper.scan());
      }
    }
    await Promise.allSettled(promises);
  }

  /**
   * Destroy a specific mapper.
   */
  destroyMapper(id: string): void {
    const mapper = this.mappers.get(id);
    if (mapper) {
      mapper.destroy();
      this.mappers.delete(id);
      this.context.logger.debug(`Destroyed mapper: ${id}`, 'MapperRegistry');
    }
  }

  /**
   * Destroy all mappers of a specific type.
   */
  destroyByType(type: MapperType): void {
    for (const [id, mapper] of this.mappers) {
      if (mapper.type === type) {
        mapper.destroy();
        this.mappers.delete(id);
      }
    }
  }

  /**
   * Destroy ALL mappers. Called on page navigation or extension unload.
   */
  destroyAll(): void {
    for (const [, mapper] of this.mappers) {
      mapper.destroy();
    }
    this.mappers.clear();
    this.context.logger.debug('All mappers destroyed', 'MapperRegistry');
  }

  /**
   * Get a mapper by ID.
   */
  get(id: string): IMapper | undefined {
    return this.mappers.get(id);
  }

  /**
   * Get all mapper IDs.
   */
  getIds(): string[] {
    return Array.from(this.mappers.keys());
  }

  /**
   * Get all mappers of a specific type.
   */
  getByType(type: MapperType): IMapper[] {
    const result: IMapper[] = [];
    for (const [, mapper] of this.mappers) {
      if (mapper.type === type) {
        result.push(mapper);
      }
    }
    return result;
  }
}
