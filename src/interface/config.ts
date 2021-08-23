import { PlatformConfig, AccessoryName, AccessoryIdentifier } from 'homebridge';
import { AirzoneCloudHomebridgePlatform } from '../platform';

export interface User {
    email: string;
    password: string;
}

export interface AirzoneCloudPlatformConfig extends PlatformConfig {
  platform: AccessoryName | AccessoryIdentifier;
  name?: string;

  // Added properties
  system: string;
  login: User;
  debug: boolean;
  user_agent: string;
  custom_base_url: string;
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

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AirzoneCloudPlatformConfig {
  export function isValid(platform: AirzoneCloudHomebridgePlatform): boolean {
    const cast = platform.config as AirzoneCloudPlatformConfig;

    const validDebug = evaluate(platform, 'boolean', 'debug', cast.debug);
    const validUserAgent = evaluate(platform, 'string', 'user_agent', cast.user_agent);
    const validSystem = evaluate(platform, 'string', 'system', cast.system);

    if (cast.login === undefined) {
      platform.log.error('Missing User(email, password) in Config.');
      return false;
    }
    const validUser = User.isValid(platform, cast.login);

    return validDebug && validUserAgent && validSystem && validUser;
  }

  export function toString(platform: AirzoneCloudHomebridgePlatform): string {
    const cast = platform.config as AirzoneCloudPlatformConfig;
    return JSON.stringify(cast, (key, value) => {
      if (key === 'password' && typeof value === 'string') {
        return value.replace(/./g, '*');
      }
      return value;
    });
  }

  export function isDaikin(platform: AirzoneCloudHomebridgePlatform): boolean {
    const cast = platform.config as AirzoneCloudPlatformConfig;
    return Boolean(cast.system.match(/dkn/g));
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace User {
  export function isValid(platform: AirzoneCloudHomebridgePlatform, config: User): boolean {
    const validEmail = evaluate(platform, 'string', 'email', config.email);
    const validPassword = evaluate(platform, 'string', 'password', config.password);

    return validEmail && validPassword;
  }
}