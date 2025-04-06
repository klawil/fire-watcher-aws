import { getLogger } from "@/logic/logger";
import { Validator } from "@/types/backend/validation";

const logger = getLogger('stack/utils/validation');

export function validateObject<T extends object>(
  obj: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  validator: Validator<T>
): [T | null, (keyof T)[] ] {
  logger.trace('validateObject', ...arguments);
  const newObj: Partial<T> = {};

  // Validate the object
  const objKeys = Object.keys(validator) as (keyof typeof validator)[];
  const badKeys: (keyof typeof validator)[] = [];
  if (
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    obj === null
  ) {
    return [ null, objKeys ];
  }

  // Loop over the keys
  objKeys.forEach(key => {
    const config = validator[key];

    // If the key is undefined, show an error if it is required
    if (typeof obj[key] === 'undefined') {
      if (config.required) {
        badKeys.push(key);
      }
      return;
    }

    // Validate using the different types
    const value = config.parse ? config.parse(obj[key]) : obj[key];
    let foundType = false;

    // Validate strings
    if (typeof value === 'string') {
      const conf = config.types.string;
      if (
        !conf ||
        (conf.regex && !conf.regex.test(value)) ||
        (conf.exact && !conf.exact.includes(value))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as string`,
          obj[key],
          value,
          conf,
          (conf?.regex && !conf.regex.test(value)),
          (conf?.exact && !conf.exact.includes(value)),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate numbers
    if (typeof value === 'number') {
      const conf = config.types.number;
      if (
        !conf ||
        Number.isNaN(value) ||
        (conf.regex && !conf.regex.test(value.toString())) ||
        (conf.exact && !conf.exact.includes(value))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as number`,
          obj[key],
          value,
          conf,
          Number.isNaN(value),
          (conf?.regex && !conf.regex.test(value.toString())),
          (conf?.exact && !conf.exact.includes(value)),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate booleans
    if (typeof value === 'boolean') {
      const conf = config.types.boolean;
      if (
        !conf ||
        (conf.regex && !conf.regex.test(value.toString())) ||
        (conf.exact && !conf.exact.includes(value))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as boolean`,
          obj[key],
          value,
          conf,
          (conf?.regex && !conf.regex.test(value.toString())),
          (conf?.exact && !conf.exact.includes(value)),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate arrays
    if (Array.isArray(value)) {
      const conf = config.types.array;
      if (
        !conf ||
        (conf.regex && value.some(v => !conf.regex?.test(v.toString()))) ||
        (conf.exact && value.some(v => !conf.exact?.includes(v)))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as boolean`,
          obj[key],
          value,
          conf,
          (conf?.regex && value.some(v => !conf.regex?.test(v.toString()))),
          (conf?.exact && value.some(v => !conf.exact?.includes(v))),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate null values
    if (value === null) {
      const conf = config.types.null;
      if (!conf) {
        logger.error(
          `Failed to validate ${String(key)} as null`,
          obj[key],
          value,
          conf,
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // If it isn't a valid type
    if (!foundType) {
      badKeys.push(key);
      return;
    }
    
    // Add the key to the object
    newObj[key] = value;
  });

  if (badKeys.length > 0) {
    return [ null, badKeys ];
  }

  return [
    newObj as T,
    [],
  ];
}
