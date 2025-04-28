import { createClient, RedisClientType } from "redis";
import { RedisConfig } from "../../interfaces/redis.js";
import { getConfig, setConfig } from "../config/core.js";

class RedisService {
  private client: RedisClientType;
  private instancePrefix: string;
  private defaultDB: 0 | 1 | 2;

  constructor(config: RedisConfig) {
    this.defaultDB = config.defaultDB ?? 0;

    this.client = createClient({
      url: `redis://${config.user}:${config.password}@${config.host}:${config.port}`,
      database: this.defaultDB,
      socket: {
        connectTimeout: 5000,
      }
    });

    this.instancePrefix = '';
  }

  private withPrefix(key: string): string {
    return `${this.instancePrefix}:${key}`;
  }

  private _initialized = false;

  public async init(isolated : boolean = false): Promise<boolean> {
    if (this._initialized) return true;

    if (isolated) {
      this.instancePrefix = `ns:${await getInstancePrefix()}:${Math.random().toString(36).substring(2, 10)}`;
    } else {
      this.instancePrefix = `ns:${await getInstancePrefix()}`;
    }
  
    if (!this.instancePrefix) return false;

    if (this.client.isOpen) {
      return true;
    }
  
    try {
      await this.client.connect();
    } catch (err) {
      console.log(err)
      return false;
    }
    await this.flushInstanceKeys();
    this._initialized = true;
    return true;
  }

  public async flushAll(): Promise<boolean> {
    try {
      await this.client.sendCommand(["flushall"]);
      return true;
    } catch (error) {
      return false;
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(this.withPrefix(key));
    } catch (error) {
      return null;
    }
  }

  public async getJSON<T>(key: string): Promise<T | null> {
    try {
      const data = await this.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      return null;
    }
  }

  public async set(key: string, value: string, options: { EX?: number } = {}): Promise<boolean> {
    try {
      await this.client.set(this.withPrefix(key), value, options);
      return true;
    } catch (error) {
      return false;
    }
  }

  public async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(this.withPrefix(key));
      return result > 0;
    } catch (error) {
      return false;
    }
  }

  public async hashGetAll(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(this.withPrefix(key));
    } catch (error) {
      return {};
    }
  }

  public async hashGet(key: string, field: string): Promise<string | null> {
    try {
      const result = await this.client.hGet(this.withPrefix(key), field);
      return result === undefined ? null : result;
    } catch (error) {
      return null;
    }
  }

  public async hashSet(key: string, fields: Record<string, string | number>, timeWindow: number = 0): Promise<boolean> {
    try {
      await this.client.hSet(this.withPrefix(key), fields);
      if (timeWindow > 0) {
        await this.client.expire(this.withPrefix(key), timeWindow);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  public async hashIncrementBy(key: string, field: string, increment: number): Promise<number | null> {
    try {
      return await this.client.hIncrBy(this.withPrefix(key), field, increment);
    } catch (error) {
      return null;
    }
  }

  public async scanKeys(pattern: string): Promise<string[]> {
    try {
      let cursor = 0;
      const keys: string[] = [];
      const fullPattern = `${this.instancePrefix}:${pattern}`;

      do {
        const result = await this.client.scan(cursor, { MATCH: fullPattern, COUNT: 100 });
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);

      return keys;
    } catch (error) {
      return [];
    }
  }

  public async slidingWindowIncrement(key: string, now: number, windowMs: number, expireSeconds: number): Promise<number> {
    try {
      const prefixedKey = this.withPrefix(key);
      const pipeline = this.client.multi();
  
      pipeline.zRemRangeByScore(prefixedKey, 0, now - windowMs);
      pipeline.zAdd(prefixedKey, { score: now, value: now.toString() });
      pipeline.zCard(prefixedKey);
      pipeline.expire(prefixedKey, expireSeconds);
  
      const results = await pipeline.exec();
      const count = (results && typeof results[2] === "number") ? results[2] : 0;
  
      return count;
    } catch (error) {
      return 0;
    }
  }

  public async slidingWindowOldest(key: string): Promise<number> {
    try {
      const prefixedKey = this.withPrefix(key);
      const res = await this.client.zRange(prefixedKey, 0, 0);
      return res.length > 0 ? Number(res[0]) : 0;
    } catch (error) {
      return 0;
    }
  }

  private async flushInstanceKeys(): Promise<boolean> {
    try {
      let cursor = 0;
      const matchPattern = `${this.instancePrefix}:*`; 
  
      do {
        const result = await this.client.scan(cursor, { MATCH: matchPattern, COUNT: 100 });
        cursor = result.cursor;
  
        if (result.keys.length > 0) {
          await this.client.del(result.keys);
        }
      } while (cursor !== 0);
  
      return true;
  
    } catch (error) {
      return false;
    }
  }

}

const getInstancePrefix = async (domain : string = ""): Promise<string> => {
  const configPrefix = getConfig(domain, ["redis", "instancePrefix"]);

  if (!configPrefix || configPrefix.length < 8) {
    const newPrefix = Math.random().toString(36).substring(2, 10);

    if (await setConfig(domain, ["redis", "instancePrefix"], newPrefix)) {
      return newPrefix;
    }

    return "";
  }

  return configPrefix;
}

export { RedisService };