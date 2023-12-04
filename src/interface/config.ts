import { PlatformConfig, AccessoryName, AccessoryIdentifier } from 'homebridge';
import { AirzoneCloudHomebridgePlatform } from '../platform';

interface User {
    email: string;
    password: string;
}

interface Debug {
  general: boolean;
  time: boolean;
  gets: boolean;
  sets: boolean;
  fetch: boolean;
  websocket: boolean;
  status: boolean;
}

export interface AirzoneCloudPlatformConfig extends PlatformConfig {
  platform: AccessoryName | AccessoryIdentifier;
  name?: string;

  // Added properties
  system: string;
  login: User;
  debug: Debug;
  auto_off: boolean;
  cache: {
    max: number;
    ttl: number;
  };
  user_agent: string;
  custom_base_url: string;
}

function evaluateAll(platform: AirzoneCloudHomebridgePlatform, types: string[], key: string, value?: unknown): boolean {
  let result = false;

  if (value === undefined) {
    platform.log.error(`Missing ${key} in Config.`);
    return false;
  }
  types.forEach(type => {
    result = result || typeof(value) === type;
  });

  if (!result) {
    platform.log.error(`Config ${key} has invalid value: ${value}. Expected one of ${types}, got ${typeof(value)}.`);
  }
  return result;
}

function evaluate(platform: AirzoneCloudHomebridgePlatform, type: string, key: string, value?: unknown): boolean {
  if (value === undefined) {
    platform.log.error(`Missing ${key} in Config.`);
    return false;
  }
  if (typeof(value) !== type) {
    platform.log.error(`Config ${key} has invalid value: ${value}. Expected ${type}, got ${typeof(value)}.`);
    return false;
  }
  return true;
}

export class AirzoneCloudPlatformConfig implements PlatformConfig {
  private constructor() {
    // Not need for static class method
  }

  public static isValid(platform: AirzoneCloudHomebridgePlatform): boolean {
    const cast = platform.config as AirzoneCloudPlatformConfig;

    const validDebug = evaluateAll(platform, ['boolean', 'object'], 'debug', cast.debug);
    const validAutoOff = evaluate(platform, 'boolean', 'auto_off', cast.auto_off);
    const validCache = cast.cache ? evaluate(platform, 'number', 'cache.max', cast.cache?.max) &&
      evaluate(platform, 'number', 'cache.ttl', cast.cache?.ttl) : true;
    const validUserAgent = evaluate(platform, 'string', 'user_agent', cast.user_agent);
    const validSystem = evaluate(platform, 'string', 'system', cast.system);

    if (cast.login === undefined) {
      platform.log.error('Missing User(email, password) in Config.');
      return false;
    }
    const validUser = User.isValid(platform, cast.login);

    return validDebug && validAutoOff && validCache && validUserAgent && validSystem && validUser;
  }

  public static toString(platform: AirzoneCloudHomebridgePlatform): string {
    const cast = platform.config as AirzoneCloudPlatformConfig;
    return JSON.stringify(cast, (key, value) => {
      if (key === 'password' && typeof value === 'string') {
        return value.replace(/./g, '*');
      }
      return value;
    });
  }

  public static isDaikin(platform: AirzoneCloudHomebridgePlatform): boolean {
    const cast = platform.config as AirzoneCloudPlatformConfig;
    return Boolean(cast.system.match(/dkn\./g));
  }

  public static isOldAirzone(platform: AirzoneCloudHomebridgePlatform): boolean {
    const cast = platform.config as AirzoneCloudPlatformConfig;
    return Boolean(cast.system.match(/www\./g));
  }

}

class User {
  private constructor() {
    // Not need for static class method
  }

  public static isValid(platform: AirzoneCloudHomebridgePlatform, config: User): boolean {
    const validEmail = evaluate(platform, 'string', 'email', config.email);
    const validPassword = evaluate(platform, 'string', 'password', config.password);

    return validEmail && validPassword;
  }

}