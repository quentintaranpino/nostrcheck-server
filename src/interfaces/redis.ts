interface RedisConfig {
    host: string;
    port: string;
    user: string;
    password: string;
    defaultDB?: 0 | 1 | 2;
  }

  export { RedisConfig };