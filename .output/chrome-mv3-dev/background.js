var background = (function() {
  "use strict";
  function defineBackground(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  const version = "1.32.0";
  var lookup = [];
  var revLookup = [];
  var Arr = Uint8Array;
  var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }
  revLookup["-".charCodeAt(0)] = 62;
  revLookup["_".charCodeAt(0)] = 63;
  function getLens(b64) {
    var len2 = b64.length;
    if (len2 % 4 > 0) {
      throw new Error("Invalid string. Length must be a multiple of 4");
    }
    var validLen = b64.indexOf("=");
    if (validLen === -1) validLen = len2;
    var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
    return [validLen, placeHoldersLen];
  }
  function _byteLength(_b64, validLen, placeHoldersLen) {
    return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
  }
  function toByteArray(b64) {
    var tmp;
    var lens = getLens(b64);
    var validLen = lens[0];
    var placeHoldersLen = lens[1];
    var arr2 = new Arr(_byteLength(b64, validLen, placeHoldersLen));
    var curByte = 0;
    var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
    var i2;
    for (i2 = 0; i2 < len2; i2 += 4) {
      tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
      arr2[curByte++] = tmp >> 16 & 255;
      arr2[curByte++] = tmp >> 8 & 255;
      arr2[curByte++] = tmp & 255;
    }
    if (placeHoldersLen === 2) {
      tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
      arr2[curByte++] = tmp & 255;
    }
    if (placeHoldersLen === 1) {
      tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
      arr2[curByte++] = tmp >> 8 & 255;
      arr2[curByte++] = tmp & 255;
    }
    return arr2;
  }
  function tripletToBase64(num) {
    return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
  }
  function encodeChunk(uint8, start, end) {
    var tmp;
    var output = [];
    for (var i2 = start; i2 < end; i2 += 3) {
      tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
      output.push(tripletToBase64(tmp));
    }
    return output.join("");
  }
  function fromByteArray(uint8) {
    var tmp;
    var len2 = uint8.length;
    var extraBytes = len2 % 3;
    var parts = [];
    var maxChunkLength = 16383;
    for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
      parts.push(
        encodeChunk(
          uint8,
          i2,
          i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength
        )
      );
    }
    if (extraBytes === 1) {
      tmp = uint8[len2 - 1];
      parts.push(lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "==");
    } else if (extraBytes === 2) {
      tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
      parts.push(
        lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
      );
    }
    return parts.join("");
  }
  function parseArgs(args) {
    if (args === void 0) {
      return {};
    }
    if (!isSimpleObject(args)) {
      throw new Error(
        `The arguments to a Convex function must be an object. Received: ${args}`
      );
    }
    return args;
  }
  function validateDeploymentUrl(deploymentUrl) {
    if (typeof deploymentUrl === "undefined") {
      throw new Error(
        `Client created with undefined deployment address. If you used an environment variable, check that it's set.`
      );
    }
    if (typeof deploymentUrl !== "string") {
      throw new Error(
        `Invalid deployment address: found ${deploymentUrl}".`
      );
    }
    if (!(deploymentUrl.startsWith("http:") || deploymentUrl.startsWith("https:"))) {
      throw new Error(
        `Invalid deployment address: Must start with "https://" or "http://". Found "${deploymentUrl}".`
      );
    }
    try {
      new URL(deploymentUrl);
    } catch {
      throw new Error(
        `Invalid deployment address: "${deploymentUrl}" is not a valid URL. If you believe this URL is correct, use the \`skipConvexDeploymentUrlCheck\` option to bypass this.`
      );
    }
    if (deploymentUrl.endsWith(".convex.site")) {
      throw new Error(
        `Invalid deployment address: "${deploymentUrl}" ends with .convex.site, which is used for HTTP Actions. Convex deployment URLs typically end with .convex.cloud? If you believe this URL is correct, use the \`skipConvexDeploymentUrlCheck\` option to bypass this.`
      );
    }
  }
  function isSimpleObject(value) {
    const isObject = typeof value === "object";
    const prototype = Object.getPrototypeOf(value);
    const isSimple = prototype === null || prototype === Object.prototype || // Objects generated from other contexts (e.g. across Node.js `vm` modules) will not satisfy the previous
    // conditions but are still simple objects.
    prototype?.constructor?.name === "Object";
    return isObject && isSimple;
  }
  const LITTLE_ENDIAN = true;
  const MIN_INT64 = BigInt("-9223372036854775808");
  const MAX_INT64 = BigInt("9223372036854775807");
  const ZERO = BigInt("0");
  const EIGHT = BigInt("8");
  const TWOFIFTYSIX = BigInt("256");
  function isSpecial(n) {
    return Number.isNaN(n) || !Number.isFinite(n) || Object.is(n, -0);
  }
  function slowBigIntToBase64(value) {
    if (value < ZERO) {
      value -= MIN_INT64 + MIN_INT64;
    }
    let hex = value.toString(16);
    if (hex.length % 2 === 1) hex = "0" + hex;
    const bytes = new Uint8Array(new ArrayBuffer(8));
    let i2 = 0;
    for (const hexByte of hex.match(/.{2}/g).reverse()) {
      bytes.set([parseInt(hexByte, 16)], i2++);
      value >>= EIGHT;
    }
    return fromByteArray(bytes);
  }
  function slowBase64ToBigInt(encoded) {
    const integerBytes = toByteArray(encoded);
    if (integerBytes.byteLength !== 8) {
      throw new Error(
        `Received ${integerBytes.byteLength} bytes, expected 8 for $integer`
      );
    }
    let value = ZERO;
    let power = ZERO;
    for (const byte of integerBytes) {
      value += BigInt(byte) * TWOFIFTYSIX ** power;
      power++;
    }
    if (value > MAX_INT64) {
      value += MIN_INT64 + MIN_INT64;
    }
    return value;
  }
  function modernBigIntToBase64(value) {
    if (value < MIN_INT64 || MAX_INT64 < value) {
      throw new Error(
        `BigInt ${value} does not fit into a 64-bit signed integer.`
      );
    }
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, value, true);
    return fromByteArray(new Uint8Array(buffer));
  }
  function modernBase64ToBigInt(encoded) {
    const integerBytes = toByteArray(encoded);
    if (integerBytes.byteLength !== 8) {
      throw new Error(
        `Received ${integerBytes.byteLength} bytes, expected 8 for $integer`
      );
    }
    const intBytesView = new DataView(integerBytes.buffer);
    return intBytesView.getBigInt64(0, true);
  }
  const bigIntToBase64 = DataView.prototype.setBigInt64 ? modernBigIntToBase64 : slowBigIntToBase64;
  const base64ToBigInt = DataView.prototype.getBigInt64 ? modernBase64ToBigInt : slowBase64ToBigInt;
  const MAX_IDENTIFIER_LEN = 1024;
  function validateObjectField(k) {
    if (k.length > MAX_IDENTIFIER_LEN) {
      throw new Error(
        `Field name ${k} exceeds maximum field name length ${MAX_IDENTIFIER_LEN}.`
      );
    }
    if (k.startsWith("$")) {
      throw new Error(`Field name ${k} starts with a '$', which is reserved.`);
    }
    for (let i2 = 0; i2 < k.length; i2 += 1) {
      const charCode = k.charCodeAt(i2);
      if (charCode < 32 || charCode >= 127) {
        throw new Error(
          `Field name ${k} has invalid character '${k[i2]}': Field names can only contain non-control ASCII characters`
        );
      }
    }
  }
  function jsonToConvex(value) {
    if (value === null) {
      return value;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((value2) => jsonToConvex(value2));
    }
    if (typeof value !== "object") {
      throw new Error(`Unexpected type of ${value}`);
    }
    const entries = Object.entries(value);
    if (entries.length === 1) {
      const key = entries[0][0];
      if (key === "$bytes") {
        if (typeof value.$bytes !== "string") {
          throw new Error(`Malformed $bytes field on ${value}`);
        }
        return toByteArray(value.$bytes).buffer;
      }
      if (key === "$integer") {
        if (typeof value.$integer !== "string") {
          throw new Error(`Malformed $integer field on ${value}`);
        }
        return base64ToBigInt(value.$integer);
      }
      if (key === "$float") {
        if (typeof value.$float !== "string") {
          throw new Error(`Malformed $float field on ${value}`);
        }
        const floatBytes = toByteArray(value.$float);
        if (floatBytes.byteLength !== 8) {
          throw new Error(
            `Received ${floatBytes.byteLength} bytes, expected 8 for $float`
          );
        }
        const floatBytesView = new DataView(floatBytes.buffer);
        const float = floatBytesView.getFloat64(0, LITTLE_ENDIAN);
        if (!isSpecial(float)) {
          throw new Error(`Float ${float} should be encoded as a number`);
        }
        return float;
      }
      if (key === "$set") {
        throw new Error(
          `Received a Set which is no longer supported as a Convex type.`
        );
      }
      if (key === "$map") {
        throw new Error(
          `Received a Map which is no longer supported as a Convex type.`
        );
      }
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      validateObjectField(k);
      out[k] = jsonToConvex(v);
    }
    return out;
  }
  const MAX_VALUE_FOR_ERROR_LEN = 16384;
  function stringifyValueForError(value) {
    const str = JSON.stringify(value, (_key, value2) => {
      if (value2 === void 0) {
        return "undefined";
      }
      if (typeof value2 === "bigint") {
        return `${value2.toString()}n`;
      }
      return value2;
    });
    if (str.length > MAX_VALUE_FOR_ERROR_LEN) {
      const rest = "[...truncated]";
      let truncateAt = MAX_VALUE_FOR_ERROR_LEN - rest.length;
      const codePoint = str.codePointAt(truncateAt - 1);
      if (codePoint !== void 0 && codePoint > 65535) {
        truncateAt -= 1;
      }
      return str.substring(0, truncateAt) + rest;
    }
    return str;
  }
  function convexToJsonInternal(value, originalValue, context, includeTopLevelUndefined) {
    if (value === void 0) {
      const contextText = context && ` (present at path ${context} in original object ${stringifyValueForError(
        originalValue
      )})`;
      throw new Error(
        `undefined is not a valid Convex value${contextText}. To learn about Convex's supported types, see https://docs.convex.dev/using/types.`
      );
    }
    if (value === null) {
      return value;
    }
    if (typeof value === "bigint") {
      if (value < MIN_INT64 || MAX_INT64 < value) {
        throw new Error(
          `BigInt ${value} does not fit into a 64-bit signed integer.`
        );
      }
      return { $integer: bigIntToBase64(value) };
    }
    if (typeof value === "number") {
      if (isSpecial(value)) {
        const buffer = new ArrayBuffer(8);
        new DataView(buffer).setFloat64(0, value, LITTLE_ENDIAN);
        return { $float: fromByteArray(new Uint8Array(buffer)) };
      } else {
        return value;
      }
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return { $bytes: fromByteArray(new Uint8Array(value)) };
    }
    if (Array.isArray(value)) {
      return value.map(
        (value2, i2) => convexToJsonInternal(value2, originalValue, context + `[${i2}]`)
      );
    }
    if (value instanceof Set) {
      throw new Error(
        errorMessageForUnsupportedType(context, "Set", [...value], originalValue)
      );
    }
    if (value instanceof Map) {
      throw new Error(
        errorMessageForUnsupportedType(context, "Map", [...value], originalValue)
      );
    }
    if (!isSimpleObject(value)) {
      const theType = value?.constructor?.name;
      const typeName = theType ? `${theType} ` : "";
      throw new Error(
        errorMessageForUnsupportedType(context, typeName, value, originalValue)
      );
    }
    const out = {};
    const entries = Object.entries(value);
    entries.sort(([k1, _v1], [k2, _v2]) => k1 === k2 ? 0 : k1 < k2 ? -1 : 1);
    for (const [k, v] of entries) {
      if (v !== void 0) {
        validateObjectField(k);
        out[k] = convexToJsonInternal(v, originalValue, context + `.${k}`);
      }
    }
    return out;
  }
  function errorMessageForUnsupportedType(context, typeName, value, originalValue) {
    if (context) {
      return `${typeName}${stringifyValueForError(
        value
      )} is not a supported Convex type (present at path ${context} in original object ${stringifyValueForError(
        originalValue
      )}). To learn about Convex's supported types, see https://docs.convex.dev/using/types.`;
    } else {
      return `${typeName}${stringifyValueForError(
        value
      )} is not a supported Convex type.`;
    }
  }
  function convexToJson(value) {
    return convexToJsonInternal(value, value, "");
  }
  var __defProp$2 = Object.defineProperty;
  var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$2 = (obj, key, value) => __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
  var _a, _b;
  const IDENTIFYING_FIELD = Symbol.for("ConvexError");
  class ConvexError extends (_b = Error, _a = IDENTIFYING_FIELD, _b) {
    constructor(data) {
      super(typeof data === "string" ? data : stringifyValueForError(data));
      __publicField$2(this, "name", "ConvexError");
      __publicField$2(this, "data");
      __publicField$2(this, _a, true);
      this.data = data;
    }
  }
  const arr = () => Array.from({ length: 4 }, () => 0);
  arr();
  arr();
  var __defProp$1 = Object.defineProperty;
  var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
  const INFO_COLOR = "color:rgb(0, 145, 255)";
  function prefix_for_source(source) {
    switch (source) {
      case "query":
        return "Q";
      case "mutation":
        return "M";
      case "action":
        return "A";
      case "any":
        return "?";
    }
  }
  class DefaultLogger {
    constructor(options) {
      __publicField$1(this, "_onLogLineFuncs");
      __publicField$1(this, "_verbose");
      this._onLogLineFuncs = {};
      this._verbose = options.verbose;
    }
    addLogLineListener(func) {
      let id = Math.random().toString(36).substring(2, 15);
      for (let i2 = 0; i2 < 10; i2++) {
        if (this._onLogLineFuncs[id] === void 0) {
          break;
        }
        id = Math.random().toString(36).substring(2, 15);
      }
      this._onLogLineFuncs[id] = func;
      return () => {
        delete this._onLogLineFuncs[id];
      };
    }
    logVerbose(...args) {
      if (this._verbose) {
        for (const func of Object.values(this._onLogLineFuncs)) {
          func("debug", `${(/* @__PURE__ */ new Date()).toISOString()}`, ...args);
        }
      }
    }
    log(...args) {
      for (const func of Object.values(this._onLogLineFuncs)) {
        func("info", ...args);
      }
    }
    warn(...args) {
      for (const func of Object.values(this._onLogLineFuncs)) {
        func("warn", ...args);
      }
    }
    error(...args) {
      for (const func of Object.values(this._onLogLineFuncs)) {
        func("error", ...args);
      }
    }
  }
  function instantiateDefaultLogger(options) {
    const logger2 = new DefaultLogger(options);
    logger2.addLogLineListener((level, ...args) => {
      switch (level) {
        case "debug":
          console.debug(...args);
          break;
        case "info":
          console.log(...args);
          break;
        case "warn":
          console.warn(...args);
          break;
        case "error":
          console.error(...args);
          break;
        default: {
          console.log(...args);
        }
      }
    });
    return logger2;
  }
  function instantiateNoopLogger(options) {
    return new DefaultLogger(options);
  }
  function logForFunction(logger2, type, source, udfPath, message) {
    const prefix = prefix_for_source(source);
    if (typeof message === "object") {
      message = `ConvexError ${JSON.stringify(message.errorData, null, 2)}`;
    }
    {
      const match = message.match(/^\[.*?\] /);
      if (match === null) {
        logger2.error(
          `[CONVEX ${prefix}(${udfPath})] Could not parse console.log`
        );
        return;
      }
      const level = message.slice(1, match[0].length - 2);
      const args = message.slice(match[0].length);
      logger2.log(`%c[CONVEX ${prefix}(${udfPath})] [${level}]`, INFO_COLOR, args);
    }
  }
  const functionName = Symbol.for("functionName");
  const toReferencePath = Symbol.for("toReferencePath");
  function extractReferencePath(reference) {
    return reference[toReferencePath] ?? null;
  }
  function isFunctionHandle(s) {
    return s.startsWith("function://");
  }
  function getFunctionAddress(functionReference) {
    let functionAddress;
    if (typeof functionReference === "string") {
      if (isFunctionHandle(functionReference)) {
        functionAddress = { functionHandle: functionReference };
      } else {
        functionAddress = { name: functionReference };
      }
    } else if (functionReference[functionName]) {
      functionAddress = { name: functionReference[functionName] };
    } else {
      const referencePath = extractReferencePath(functionReference);
      if (!referencePath) {
        throw new Error(`${functionReference} is not a functionReference`);
      }
      functionAddress = { reference: referencePath };
    }
    return functionAddress;
  }
  function getFunctionName(functionReference) {
    const address = getFunctionAddress(functionReference);
    if (address.name === void 0) {
      if (address.functionHandle !== void 0) {
        throw new Error(
          `Expected function reference like "api.file.func" or "internal.file.func", but received function handle ${address.functionHandle}`
        );
      } else if (address.reference !== void 0) {
        throw new Error(
          `Expected function reference in the current component like "api.file.func" or "internal.file.func", but received reference ${address.reference}`
        );
      }
      throw new Error(
        `Expected function reference like "api.file.func" or "internal.file.func", but received ${JSON.stringify(address)}`
      );
    }
    if (typeof functionReference === "string") return functionReference;
    const name = functionReference[functionName];
    if (!name) {
      throw new Error(`${functionReference} is not a functionReference`);
    }
    return name;
  }
  function createApi(pathParts = []) {
    const handler = {
      get(_, prop) {
        if (typeof prop === "string") {
          const newParts = [...pathParts, prop];
          return createApi(newParts);
        } else if (prop === functionName) {
          if (pathParts.length < 2) {
            const found = ["api", ...pathParts].join(".");
            throw new Error(
              `API path is expected to be of the form \`api.moduleName.functionName\`. Found: \`${found}\``
            );
          }
          const path = pathParts.slice(0, -1).join("/");
          const exportName = pathParts[pathParts.length - 1];
          if (exportName === "default") {
            return path;
          } else {
            return path + ":" + exportName;
          }
        } else if (prop === Symbol.toStringTag) {
          return "FunctionReference";
        } else {
          return void 0;
        }
      }
    };
    return new Proxy({}, handler);
  }
  const anyApi = createApi();
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const STATUS_CODE_UDF_FAILED = 560;
  let specifiedFetch = void 0;
  class ConvexHttpClient {
    /**
     * Create a new {@link ConvexHttpClient}.
     *
     * @param address - The url of your Convex deployment, often provided
     * by an environment variable. E.g. `https://small-mouse-123.convex.cloud`.
     * @param options - An object of options.
     * - `skipConvexDeploymentUrlCheck` - Skip validating that the Convex deployment URL looks like
     * `https://happy-animal-123.convex.cloud` or localhost. This can be useful if running a self-hosted
     * Convex backend that uses a different URL.
     * - `logger` - A logger or a boolean. If not provided, logs to the console.
     * You can construct your own logger to customize logging to log elsewhere
     * or not log at all, or use `false` as a shorthand for a no-op logger.
     * A logger is an object with 4 methods: log(), warn(), error(), and logVerbose().
     * These methods can receive multiple arguments of any types, like console.log().
     * - `auth` - A JWT containing identity claims accessible in Convex functions.
     * This identity may expire so it may be necessary to call `setAuth()` later,
     * but for short-lived clients it's convenient to specify this value here.
     * - `fetch` - A custom fetch implementation to use for all HTTP requests made by this client.
     */
    constructor(address, options) {
      __publicField(this, "address");
      __publicField(this, "auth");
      __publicField(this, "adminAuth");
      __publicField(this, "encodedTsPromise");
      __publicField(this, "debug");
      __publicField(this, "fetchOptions");
      __publicField(this, "fetch");
      __publicField(this, "logger");
      __publicField(this, "mutationQueue", []);
      __publicField(this, "isProcessingQueue", false);
      if (typeof options === "boolean") {
        throw new Error(
          "skipConvexDeploymentUrlCheck as the second argument is no longer supported. Please pass an options object, `{ skipConvexDeploymentUrlCheck: true }`."
        );
      }
      const opts = options ?? {};
      if (opts.skipConvexDeploymentUrlCheck !== true) {
        validateDeploymentUrl(address);
      }
      this.logger = options?.logger === false ? instantiateNoopLogger({ verbose: false }) : options?.logger !== true && options?.logger ? options.logger : instantiateDefaultLogger({ verbose: false });
      this.address = address;
      this.debug = true;
      this.auth = void 0;
      this.adminAuth = void 0;
      this.fetch = options?.fetch;
      if (options?.auth) {
        this.setAuth(options.auth);
      }
    }
    /**
     * Obtain the {@link ConvexHttpClient}'s URL to its backend.
     * @deprecated Use url, which returns the url without /api at the end.
     *
     * @returns The URL to the Convex backend, including the client's API version.
     */
    backendUrl() {
      return `${this.address}/api`;
    }
    /**
     * Return the address for this client, useful for creating a new client.
     *
     * Not guaranteed to match the address with which this client was constructed:
     * it may be canonicalized.
     */
    get url() {
      return this.address;
    }
    /**
     * Set the authentication token to be used for subsequent queries and mutations.
     *
     * Should be called whenever the token changes (i.e. due to expiration and refresh).
     *
     * @param value - JWT-encoded OpenID Connect identity token.
     */
    setAuth(value) {
      this.clearAuth();
      this.auth = value;
    }
    /**
     * Set admin auth token to allow calling internal queries, mutations, and actions
     * and acting as an identity.
     *
     * @internal
     */
    setAdminAuth(token, actingAsIdentity) {
      this.clearAuth();
      if (actingAsIdentity !== void 0) {
        const bytes = new TextEncoder().encode(JSON.stringify(actingAsIdentity));
        const actingAsIdentityEncoded = btoa(String.fromCodePoint(...bytes));
        this.adminAuth = `${token}:${actingAsIdentityEncoded}`;
      } else {
        this.adminAuth = token;
      }
    }
    /**
     * Clear the current authentication token if set.
     */
    clearAuth() {
      this.auth = void 0;
      this.adminAuth = void 0;
    }
    /**
     * Sets whether the result log lines should be printed on the console or not.
     *
     * @internal
     */
    setDebug(debug) {
      this.debug = debug;
    }
    /**
     * Used to customize the fetch behavior in some runtimes.
     *
     * @internal
     */
    setFetchOptions(fetchOptions) {
      this.fetchOptions = fetchOptions;
    }
    /**
     * This API is experimental: it may change or disappear.
     *
     * Execute a Convex query function at the same timestamp as every other
     * consistent query execution run by this HTTP client.
     *
     * This doesn't make sense for long-lived ConvexHttpClients as Convex
     * backends can read a limited amount into the past: beyond 30 seconds
     * in the past may not be available.
     *
     * Create a new client to use a consistent time.
     *
     * @param name - The name of the query.
     * @param args - The arguments object for the query. If this is omitted,
     * the arguments will be `{}`.
     * @returns A promise of the query's result.
     *
     * @deprecated This API is experimental: it may change or disappear.
     */
    async consistentQuery(query, ...args) {
      const queryArgs = parseArgs(args[0]);
      const timestampPromise = this.getTimestamp();
      return await this.queryInner(query, queryArgs, { timestampPromise });
    }
    async getTimestamp() {
      if (this.encodedTsPromise) {
        return this.encodedTsPromise;
      }
      return this.encodedTsPromise = this.getTimestampInner();
    }
    async getTimestampInner() {
      const localFetch = this.fetch || specifiedFetch || fetch;
      const headers = {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${version}`
      };
      const response = await localFetch(`${this.address}/api/query_ts`, {
        ...this.fetchOptions,
        method: "POST",
        headers
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const { ts } = await response.json();
      return ts;
    }
    /**
     * Execute a Convex query function.
     *
     * @param name - The name of the query.
     * @param args - The arguments object for the query. If this is omitted,
     * the arguments will be `{}`.
     * @returns A promise of the query's result.
     */
    async query(query, ...args) {
      const queryArgs = parseArgs(args[0]);
      return await this.queryInner(query, queryArgs, {});
    }
    async queryInner(query, queryArgs, options) {
      const name = getFunctionName(query);
      const args = [convexToJson(queryArgs)];
      const headers = {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${version}`
      };
      if (this.adminAuth) {
        headers["Authorization"] = `Convex ${this.adminAuth}`;
      } else if (this.auth) {
        headers["Authorization"] = `Bearer ${this.auth}`;
      }
      const localFetch = this.fetch || specifiedFetch || fetch;
      const timestamp = options.timestampPromise ? await options.timestampPromise : void 0;
      const body = JSON.stringify({
        path: name,
        format: "convex_encoded_json",
        args,
        ...timestamp ? { ts: timestamp } : {}
      });
      const endpoint = timestamp ? `${this.address}/api/query_at_ts` : `${this.address}/api/query`;
      const response = await localFetch(endpoint, {
        ...this.fetchOptions,
        body,
        method: "POST",
        headers
      });
      if (!response.ok && response.status !== STATUS_CODE_UDF_FAILED) {
        throw new Error(await response.text());
      }
      const respJSON = await response.json();
      if (this.debug) {
        for (const line of respJSON.logLines ?? []) {
          logForFunction(this.logger, "info", "query", name, line);
        }
      }
      switch (respJSON.status) {
        case "success":
          return jsonToConvex(respJSON.value);
        case "error":
          if (respJSON.errorData !== void 0) {
            throw forwardErrorData(
              respJSON.errorData,
              new ConvexError(respJSON.errorMessage)
            );
          }
          throw new Error(respJSON.errorMessage);
        default:
          throw new Error(`Invalid response: ${JSON.stringify(respJSON)}`);
      }
    }
    async mutationInner(mutation, mutationArgs) {
      const name = getFunctionName(mutation);
      const body = JSON.stringify({
        path: name,
        format: "convex_encoded_json",
        args: [convexToJson(mutationArgs)]
      });
      const headers = {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${version}`
      };
      if (this.adminAuth) {
        headers["Authorization"] = `Convex ${this.adminAuth}`;
      } else if (this.auth) {
        headers["Authorization"] = `Bearer ${this.auth}`;
      }
      const localFetch = this.fetch || specifiedFetch || fetch;
      const response = await localFetch(`${this.address}/api/mutation`, {
        ...this.fetchOptions,
        body,
        method: "POST",
        headers
      });
      if (!response.ok && response.status !== STATUS_CODE_UDF_FAILED) {
        throw new Error(await response.text());
      }
      const respJSON = await response.json();
      if (this.debug) {
        for (const line of respJSON.logLines ?? []) {
          logForFunction(this.logger, "info", "mutation", name, line);
        }
      }
      switch (respJSON.status) {
        case "success":
          return jsonToConvex(respJSON.value);
        case "error":
          if (respJSON.errorData !== void 0) {
            throw forwardErrorData(
              respJSON.errorData,
              new ConvexError(respJSON.errorMessage)
            );
          }
          throw new Error(respJSON.errorMessage);
        default:
          throw new Error(`Invalid response: ${JSON.stringify(respJSON)}`);
      }
    }
    async processMutationQueue() {
      if (this.isProcessingQueue) {
        return;
      }
      this.isProcessingQueue = true;
      while (this.mutationQueue.length > 0) {
        const { mutation, args, resolve, reject } = this.mutationQueue.shift();
        try {
          const result2 = await this.mutationInner(mutation, args);
          resolve(result2);
        } catch (error) {
          reject(error);
        }
      }
      this.isProcessingQueue = false;
    }
    enqueueMutation(mutation, args) {
      return new Promise((resolve, reject) => {
        this.mutationQueue.push({ mutation, args, resolve, reject });
        void this.processMutationQueue();
      });
    }
    /**
     * Execute a Convex mutation function. Mutations are queued by default.
     *
     * @param name - The name of the mutation.
     * @param args - The arguments object for the mutation. If this is omitted,
     * the arguments will be `{}`.
     * @param options - An optional object containing
     * @returns A promise of the mutation's result.
     */
    async mutation(mutation, ...args) {
      const [fnArgs, options] = args;
      const mutationArgs = parseArgs(fnArgs);
      const queued = !options?.skipQueue;
      if (queued) {
        return await this.enqueueMutation(mutation, mutationArgs);
      } else {
        return await this.mutationInner(mutation, mutationArgs);
      }
    }
    /**
     * Execute a Convex action function. Actions are not queued.
     *
     * @param name - The name of the action.
     * @param args - The arguments object for the action. If this is omitted,
     * the arguments will be `{}`.
     * @returns A promise of the action's result.
     */
    async action(action, ...args) {
      const actionArgs = parseArgs(args[0]);
      const name = getFunctionName(action);
      const body = JSON.stringify({
        path: name,
        format: "convex_encoded_json",
        args: [convexToJson(actionArgs)]
      });
      const headers = {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${version}`
      };
      if (this.adminAuth) {
        headers["Authorization"] = `Convex ${this.adminAuth}`;
      } else if (this.auth) {
        headers["Authorization"] = `Bearer ${this.auth}`;
      }
      const localFetch = this.fetch || specifiedFetch || fetch;
      const response = await localFetch(`${this.address}/api/action`, {
        ...this.fetchOptions,
        body,
        method: "POST",
        headers
      });
      if (!response.ok && response.status !== STATUS_CODE_UDF_FAILED) {
        throw new Error(await response.text());
      }
      const respJSON = await response.json();
      if (this.debug) {
        for (const line of respJSON.logLines ?? []) {
          logForFunction(this.logger, "info", "action", name, line);
        }
      }
      switch (respJSON.status) {
        case "success":
          return jsonToConvex(respJSON.value);
        case "error":
          if (respJSON.errorData !== void 0) {
            throw forwardErrorData(
              respJSON.errorData,
              new ConvexError(respJSON.errorMessage)
            );
          }
          throw new Error(respJSON.errorMessage);
        default:
          throw new Error(`Invalid response: ${JSON.stringify(respJSON)}`);
      }
    }
    /**
     * Execute a Convex function of an unknown type. These function calls are not queued.
     *
     * @param name - The name of the function.
     * @param args - The arguments object for the function. If this is omitted,
     * the arguments will be `{}`.
     * @returns A promise of the function's result.
     *
     * @internal
     */
    async function(anyFunction, componentPath, ...args) {
      const functionArgs = parseArgs(args[0]);
      const name = typeof anyFunction === "string" ? anyFunction : getFunctionName(anyFunction);
      const body = JSON.stringify({
        componentPath,
        path: name,
        format: "convex_encoded_json",
        args: convexToJson(functionArgs)
      });
      const headers = {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${version}`
      };
      if (this.adminAuth) {
        headers["Authorization"] = `Convex ${this.adminAuth}`;
      } else if (this.auth) {
        headers["Authorization"] = `Bearer ${this.auth}`;
      }
      const localFetch = this.fetch || specifiedFetch || fetch;
      const response = await localFetch(`${this.address}/api/function`, {
        ...this.fetchOptions,
        body,
        method: "POST",
        headers
      });
      if (!response.ok && response.status !== STATUS_CODE_UDF_FAILED) {
        throw new Error(await response.text());
      }
      const respJSON = await response.json();
      if (this.debug) {
        for (const line of respJSON.logLines ?? []) {
          logForFunction(this.logger, "info", "any", name, line);
        }
      }
      switch (respJSON.status) {
        case "success":
          return jsonToConvex(respJSON.value);
        case "error":
          if (respJSON.errorData !== void 0) {
            throw forwardErrorData(
              respJSON.errorData,
              new ConvexError(respJSON.errorMessage)
            );
          }
          throw new Error(respJSON.errorMessage);
        default:
          throw new Error(`Invalid response: ${JSON.stringify(respJSON)}`);
      }
    }
  }
  function forwardErrorData(errorData, error) {
    error.data = jsonToConvex(errorData);
    return error;
  }
  function createChildComponents(root, pathParts) {
    const handler = {
      get(_, prop) {
        if (typeof prop === "string") {
          const newParts = [...pathParts, prop];
          return createChildComponents(root, newParts);
        } else if (prop === toReferencePath) {
          if (pathParts.length < 1) {
            const found = [root, ...pathParts].join(".");
            throw new Error(
              `API path is expected to be of the form \`${root}.childComponent.functionName\`. Found: \`${found}\``
            );
          }
          return `_reference/childComponent/` + pathParts.join("/");
        } else {
          return void 0;
        }
      }
    };
    return new Proxy({}, handler);
  }
  const componentsGeneric = () => createChildComponents("components", []);
  const api = anyApi;
  componentsGeneric();
  const STORAGE_KEY$1 = "vocabify_device_id";
  function generateUUID() {
    return crypto.randomUUID();
  }
  async function getDeviceId() {
    const result2 = await chrome.storage.local.get(STORAGE_KEY$1);
    if (result2[STORAGE_KEY$1]) {
      return result2[STORAGE_KEY$1];
    }
    const id = generateUUID();
    await chrome.storage.local.set({ [STORAGE_KEY$1]: id });
    return id;
  }
  async function fetchWithTimeout(url, init, timeoutMs = 6e3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("Request timed out");
      }
      throw e;
    }
  }
  async function tryMyMemory(word, lang) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", word);
    url.searchParams.set("langpair", `en|${lang}`);
    const res = await fetchWithTimeout(url.toString(), {}, 6e3);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const data = await res.json();
    if (data.responseStatus !== 200) {
      throw new Error(`MyMemory API error: ${data.responseStatus}`);
    }
    const translation = data.responseData.translatedText;
    if (translation.toLowerCase().trim() === word.toLowerCase().trim()) {
      throw new Error("MyMemory returned input unchanged");
    }
    return translation;
  }
  async function tryLibreTranslate(word, lang) {
    const res = await fetchWithTimeout(
      "https://libretranslate.com/translate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: word,
          source: "en",
          target: lang
        })
      },
      6e3
    );
    if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
    const data = await res.json();
    if (!data.translatedText) {
      throw new Error("LibreTranslate returned no translation");
    }
    return data.translatedText;
  }
  async function tryGoogleTranslate(word, lang) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "en");
    url.searchParams.set("tl", lang);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", word);
    const res = await fetchWithTimeout(url.toString(), {}, 6e3);
    if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);
    const data = await res.json();
    const translation = data?.[0]?.map((segment) => segment[0]).join("");
    if (!translation) {
      throw new Error("Google Translate returned no translation");
    }
    if (translation.toLowerCase().trim() === word.toLowerCase().trim()) {
      throw new Error("Google Translate returned input unchanged");
    }
    return translation;
  }
  async function getTargetLang() {
    try {
      const data = await chrome.storage.sync.get("targetLang");
      return data.targetLang || "ru";
    } catch {
      return "ru";
    }
  }
  async function translateWord(word, targetLang) {
    const lang = targetLang ?? await getTargetLang();
    try {
      return await tryMyMemory(word, lang);
    } catch {
    }
    try {
      return await tryLibreTranslate(word, lang);
    } catch {
    }
    try {
      return await tryGoogleTranslate(word, lang);
    } catch {
    }
    throw new Error("All translation services failed");
  }
  const STORAGE_KEY = "vocabifyPro";
  const FREE_DAILY_LIMIT = 1;
  const PRO_DAILY_LIMIT = 10;
  function todayStr() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  async function readProData() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] ?? { isPro: false, aiCallsToday: 0, aiCallsResetDate: todayStr() };
  }
  async function writeProData(data) {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }
  async function getProStatus() {
    const data = await readProData();
    if (data.aiCallsResetDate !== todayStr()) {
      data.aiCallsToday = 0;
      data.aiCallsResetDate = todayStr();
      await writeProData(data);
    }
    return { isPro: data.isPro, aiCallsToday: data.aiCallsToday };
  }
  async function canMakeAiCall() {
    const { isPro, aiCallsToday } = await getProStatus();
    const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
    const remaining = Math.max(0, limit - aiCallsToday);
    return { allowed: remaining > 0, remaining };
  }
  async function tryConsumeAiCall() {
    const data = await readProData();
    if (data.aiCallsResetDate !== todayStr()) {
      data.aiCallsToday = 0;
      data.aiCallsResetDate = todayStr();
    }
    const limit = data.isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
    if (data.aiCallsToday >= limit) {
      return { allowed: false, remaining: 0 };
    }
    data.aiCallsToday += 1;
    await writeProData(data);
    return { allowed: true, remaining: Math.max(0, limit - data.aiCallsToday) };
  }
  const REVIEW_ALARM = "vocabify-review";
  const RADAR_DECAY_ALARM = "vocabify-radar-decay";
  function isValidMessage(msg) {
    if (!msg || typeof msg !== "object" || !("type" in msg)) return false;
    const m = msg;
    switch (m.type) {
      case "TRANSLATE_WORD":
        return typeof m.word === "string";
      case "SAVE_WORD":
        return typeof m.word === "string" && typeof m.translation === "string";
      case "REVIEW_RESULT":
        return typeof m.wordId === "string" && typeof m.remembered === "boolean";
      case "GET_DEVICE_ID":
        return true;
      case "SCAN_PAGE":
        return Array.isArray(m.words);
      case "GET_VOCAB_CACHE":
        return true;
      case "AI_EXPLAIN":
        return typeof m.word === "string" && typeof m.sentence === "string";
      case "AI_SIMPLIFY":
        return typeof m.text === "string";
      case "CHECK_PRO":
        return true;
      case "GET_WORD_BY_LEMMA":
        return typeof m.lemma === "string";
      case "TOGGLE_HARD":
        return typeof m.wordId === "string";
      case "ADD_CONTEXT":
        return typeof m.wordId === "string" && typeof m.sentence === "string" && typeof m.url === "string";
      case "GET_STATS":
        return true;
      case "GET_ACHIEVEMENTS":
        return true;
      case "DELETE_WORD":
        return typeof m.wordId === "string";
      // YouTube subtitle cases removed — now using DOM-based caption observation
      default:
        return false;
    }
  }
  function logEvent(convex, deviceId, type, word) {
    convex.mutation(api.events.logEvent, { deviceId, type, word }).catch(() => {
    });
  }
  const definition = defineBackground(() => {
    const convex = new ConvexHttpClient(
      void 0
    );
    async function updateBadge() {
      try {
        const deviceId = await getDeviceId();
        const stats = await convex.query(api.words.stats, { deviceId });
        const count = stats.total;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
        chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
      } catch {
      }
    }
    chrome.runtime.onInstalled.addListener(async () => {
      await getDeviceId();
      const settings = await chrome.storage.sync.get("reviewIntervalMinutes");
      const interval = settings.reviewIntervalMinutes ?? 30;
      chrome.alarms.create(REVIEW_ALARM, { periodInMinutes: interval });
      chrome.alarms.create(RADAR_DECAY_ALARM, { periodInMinutes: 60 * 24 });
      chrome.contextMenus.create({
        id: "vocabify-translate",
        title: "Translate with Vocabify",
        contexts: ["selection"]
      });
      chrome.contextMenus.create({
        id: "vocabify-save",
        title: "Save to Vocabify",
        contexts: ["selection"]
      });
      updateBadge();
    });
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      if (!tab?.id || !info.selectionText) return;
      const text = info.selectionText.trim();
      if (!text || text.length < 2 || text.length > 40) return;
      try {
        if (info.menuItemId === "vocabify-translate") {
          await chrome.tabs.sendMessage(tab.id, {
            type: "CONTEXT_MENU_TRANSLATE",
            word: text
          });
        } else if (info.menuItemId === "vocabify-save") {
          const deviceId = await getDeviceId();
          const translation = await translateWord(text);
          await convex.mutation(api.words.add, {
            deviceId,
            word: text,
            translation,
            example: "",
            sourceUrl: tab.url || ""
          });
          logEvent(convex, deviceId, "word_saved", text);
          const xpResult = await convex.mutation(api.gamification.awardXp, {
            deviceId,
            action: "word_saved"
          });
          updateBadge();
          await chrome.tabs.sendMessage(tab.id, {
            type: "CONTEXT_MENU_SAVED",
            word: text,
            translation,
            xp: xpResult
          });
        }
      } catch (e) {
        console.error("[Vocabify] Context menu error:", e);
      }
    });
    chrome.commands.onCommand.addListener(async (command) => {
      if (command !== "translate-selection") return;
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab?.id) return;
        await chrome.tabs.sendMessage(tab.id, { type: "KEYBOARD_TRANSLATE" });
      } catch {
      }
    });
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === RADAR_DECAY_ALARM) {
        try {
          const data = await chrome.storage.local.get("vocabifyRadar");
          const radar = data.vocabifyRadar;
          if (!radar?.seen) return;
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
          const filtered = {};
          for (const [lemma, entry] of Object.entries(radar.seen)) {
            if (entry.lastSeenAt >= sevenDaysAgo) {
              filtered[lemma] = entry;
            }
          }
          await chrome.storage.local.set({ vocabifyRadar: { seen: filtered } });
        } catch (e) {
          console.error("[Vocabify] Radar decay error:", e);
        }
        return;
      }
      if (alarm.name !== REVIEW_ALARM) return;
      try {
        const deviceId = await getDeviceId();
        const settings = await chrome.storage.sync.get([
          "reviewIntervalMinutes",
          "dndUntil",
          "maxToastsPerDay"
        ]);
        if (settings.dndUntil && Date.now() < settings.dndUntil) return;
        const maxToasts = settings.maxToastsPerDay ?? 15;
        const toastData = await chrome.storage.local.get([
          "toastsShownToday",
          "lastToastResetDate"
        ]);
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        let toastsShown = toastData.toastsShownToday ?? 0;
        if (toastData.lastToastResetDate !== today) {
          toastsShown = 0;
          await chrome.storage.local.set({ toastsShownToday: 0, lastToastResetDate: today });
        }
        if (toastsShown >= maxToasts) return;
        const words = await convex.query(api.words.getReviewWords, {
          deviceId,
          limit: 1
        });
        if (words.length === 0) return;
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        const tab = tabs[0];
        if (!tab?.id) return;
        if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://"))) {
          return;
        }
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_REVIEW",
            word: words[0]
          });
          await chrome.storage.local.set({ toastsShownToday: toastsShown + 1 });
          logEvent(convex, deviceId, "toast_shown", words[0].word);
        } catch {
        }
      } catch (e) {
        console.error("[Vocabify] Alarm handler error:", e);
      }
    });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isValidMessage(message)) {
        sendResponse({ error: "Unknown message type" });
        return false;
      }
      handleMessage(message, convex, updateBadge).then(sendResponse);
      return true;
    });
  });
  async function handleMessage(message, convex, updateBadge) {
    const deviceId = await getDeviceId();
    switch (message.type) {
      case "TRANSLATE_WORD": {
        try {
          const translation = await translateWord(message.word, message.lang);
          logEvent(convex, deviceId, "word_lookup", message.word);
          return { success: true, translation };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "SAVE_WORD": {
        try {
          const wordId = await convex.mutation(api.words.add, {
            deviceId,
            word: message.word,
            translation: message.translation,
            example: message.example || "",
            sourceUrl: message.sourceUrl || "",
            exampleContext: message.exampleContext,
            exampleSource: message.exampleSource
          });
          logEvent(convex, deviceId, "word_saved", message.word);
          const xpResult = await convex.mutation(api.gamification.awardXp, {
            deviceId,
            action: "word_saved"
          });
          updateBadge();
          return { success: true, xp: xpResult, wordId };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "REVIEW_RESULT": {
        try {
          const result2 = await convex.mutation(api.words.updateReview, {
            id: message.wordId,
            deviceId,
            remembered: message.remembered
          });
          logEvent(
            convex,
            deviceId,
            message.remembered ? "review_remembered" : "review_forgot"
          );
          const xpResult = await convex.mutation(api.gamification.awardXp, {
            deviceId,
            action: message.remembered ? "review_remembered" : "review_forgot"
          });
          return {
            success: true,
            newStatus: result2?.newStatus,
            intervalDays: result2?.intervalDays,
            xp: xpResult
          };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "GET_DEVICE_ID": {
        return { deviceId };
      }
      case "SCAN_PAGE": {
        try {
          const savedWords = await convex.query(api.words.getWordSet, { deviceId });
          const savedSet = new Set(savedWords.map((w) => w.toLowerCase()));
          const unsaved = message.words.filter((w) => !savedSet.has(w.toLowerCase()));
          return { success: true, words: unsaved.slice(0, 10) };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "GET_VOCAB_CACHE": {
        try {
          const cache = await convex.query(api.words.getVocabCache, { deviceId });
          return { success: true, ...cache };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "AI_EXPLAIN": {
        try {
          const consumed = await tryConsumeAiCall();
          if (!consumed.allowed) {
            return { success: false, error: "Daily AI limit reached", remaining: 0 };
          }
          const result2 = await convex.action(api.ai.explainWord, {
            word: message.word,
            sentence: message.sentence,
            targetLang: message.targetLang,
            userLevel: message.userLevel
          });
          return { success: true, explanation: result2.explanation, remaining: consumed.remaining };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "AI_SIMPLIFY": {
        try {
          const consumed = await tryConsumeAiCall();
          if (!consumed.allowed) {
            return { success: false, error: "Daily AI limit reached", remaining: 0 };
          }
          const result2 = await convex.action(api.ai.simplifyText, {
            text: message.text,
            userLevel: message.userLevel
          });
          return {
            success: true,
            simplified: result2.simplified,
            originalLength: message.text.length,
            remaining: consumed.remaining
          };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "CHECK_PRO": {
        try {
          const status = await canMakeAiCall();
          return { success: true, ...status };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "GET_WORD_BY_LEMMA": {
        try {
          const word = await convex.query(api.words.getByLemma, {
            deviceId,
            lemma: message.lemma,
            word: message.word
          });
          return { success: true, word };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "TOGGLE_HARD": {
        try {
          await convex.mutation(api.words.toggleHard, {
            id: message.wordId,
            deviceId
          });
          return { success: true };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "ADD_CONTEXT": {
        try {
          const result2 = await convex.mutation(api.words.addContext, {
            id: message.wordId,
            deviceId,
            sentence: message.sentence,
            url: message.url
          });
          return { success: true, duplicate: result2?.duplicate ?? false };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "GET_STATS": {
        try {
          const stats = await convex.query(api.gamification.getStats, { deviceId });
          return { success: true, stats };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "GET_ACHIEVEMENTS": {
        try {
          const achievements = await convex.query(api.gamification.getAchievements, { deviceId });
          return { success: true, achievements };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "DELETE_WORD": {
        try {
          await convex.mutation(api.words.remove, {
            id: message.wordId,
            deviceId
          });
          updateBadge();
          return { success: true };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "GET_SUBTITLE_URL": {
        try {
          return { success: false, error: "Handled in raw listener" };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
    }
  }
  function initPlugins() {
  }
  const browser$1 = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  var _MatchPattern = class {
    constructor(matchPattern) {
      if (matchPattern === "<all_urls>") {
        this.isAllUrls = true;
        this.protocolMatches = [..._MatchPattern.PROTOCOLS];
        this.hostnameMatch = "*";
        this.pathnameMatch = "*";
      } else {
        const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
        if (groups == null)
          throw new InvalidMatchPattern(matchPattern, "Incorrect format");
        const [_, protocol, hostname, pathname] = groups;
        validateProtocol(matchPattern, protocol);
        validateHostname(matchPattern, hostname);
        this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
        this.hostnameMatch = hostname;
        this.pathnameMatch = pathname;
      }
    }
    includes(url) {
      if (this.isAllUrls)
        return true;
      const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
      return !!this.protocolMatches.find((protocol) => {
        if (protocol === "http")
          return this.isHttpMatch(u);
        if (protocol === "https")
          return this.isHttpsMatch(u);
        if (protocol === "file")
          return this.isFileMatch(u);
        if (protocol === "ftp")
          return this.isFtpMatch(u);
        if (protocol === "urn")
          return this.isUrnMatch(u);
      });
    }
    isHttpMatch(url) {
      return url.protocol === "http:" && this.isHostPathMatch(url);
    }
    isHttpsMatch(url) {
      return url.protocol === "https:" && this.isHostPathMatch(url);
    }
    isHostPathMatch(url) {
      if (!this.hostnameMatch || !this.pathnameMatch)
        return false;
      const hostnameMatchRegexs = [
        this.convertPatternToRegex(this.hostnameMatch),
        this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))
      ];
      const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
      return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
    }
    isFileMatch(url) {
      throw Error("Not implemented: file:// pattern matching. Open a PR to add support");
    }
    isFtpMatch(url) {
      throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
    }
    isUrnMatch(url) {
      throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
    }
    convertPatternToRegex(pattern) {
      const escaped = this.escapeForRegex(pattern);
      const starsReplaced = escaped.replace(/\\\*/g, ".*");
      return RegExp(`^${starsReplaced}$`);
    }
    escapeForRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  };
  var MatchPattern = _MatchPattern;
  MatchPattern.PROTOCOLS = ["http", "https", "file", "ftp", "urn"];
  var InvalidMatchPattern = class extends Error {
    constructor(matchPattern, reason) {
      super(`Invalid match pattern "${matchPattern}": ${reason}`);
    }
  };
  function validateProtocol(matchPattern, protocol) {
    if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*")
      throw new InvalidMatchPattern(
        matchPattern,
        `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`
      );
  }
  function validateHostname(matchPattern, hostname) {
    if (hostname.includes(":"))
      throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
    if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*."))
      throw new InvalidMatchPattern(
        matchPattern,
        `If using a wildcard (*), it must go at the start of the hostname`
      );
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
    else method("[wxt]", ...args);
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  let ws;
  function getDevServerWebSocket() {
    if (ws == null) {
      const serverUrl = "ws://localhost:3000";
      logger.debug("Connecting to dev server @", serverUrl);
      ws = new WebSocket(serverUrl, "vite-hmr");
      ws.addWxtEventListener = ws.addEventListener.bind(ws);
      ws.sendCustom = (event, payload) => ws?.send(JSON.stringify({
        type: "custom",
        event,
        payload
      }));
      ws.addEventListener("open", () => {
        logger.debug("Connected to dev server");
      });
      ws.addEventListener("close", () => {
        logger.debug("Disconnected from dev server");
      });
      ws.addEventListener("error", (event) => {
        logger.error("Failed to connect to dev server", event);
      });
      ws.addEventListener("message", (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === "custom") ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
        } catch (err) {
          logger.error("Failed to handle message", err);
        }
      });
    }
    return ws;
  }
  function keepServiceWorkerAlive() {
    setInterval(async () => {
      await browser.runtime.getPlatformInfo();
    }, 5e3);
  }
  function reloadContentScript(payload) {
    if (browser.runtime.getManifest().manifest_version == 2) reloadContentScriptMv2();
    else reloadContentScriptMv3(payload);
  }
  async function reloadContentScriptMv3({ registration, contentScript }) {
    if (registration === "runtime") await reloadRuntimeContentScriptMv3(contentScript);
    else await reloadManifestContentScriptMv3(contentScript);
  }
  async function reloadManifestContentScriptMv3(contentScript) {
    const id = `wxt:${contentScript.js[0]}`;
    logger.log("Reloading content script:", contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug("Existing scripts:", registered);
    const existing = registered.find((cs) => cs.id === id);
    if (existing) {
      logger.debug("Updating content script", existing);
      await browser.scripting.updateContentScripts([{
        ...contentScript,
        id,
        css: contentScript.css ?? []
      }]);
    } else {
      logger.debug("Registering new content script...");
      await browser.scripting.registerContentScripts([{
        ...contentScript,
        id,
        css: contentScript.css ?? []
      }]);
    }
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadRuntimeContentScriptMv3(contentScript) {
    logger.log("Reloading content script:", contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug("Existing scripts:", registered);
    const matches = registered.filter((cs) => {
      const hasJs = contentScript.js?.find((js) => cs.js?.includes(js));
      const hasCss = contentScript.css?.find((css) => cs.css?.includes(css));
      return hasJs || hasCss;
    });
    if (matches.length === 0) {
      logger.log("Content script is not registered yet, nothing to reload", contentScript);
      return;
    }
    await browser.scripting.updateContentScripts(matches);
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadTabsForContentScript(contentScript) {
    const allTabs = await browser.tabs.query({});
    const matchPatterns = contentScript.matches.map((match) => new MatchPattern(match));
    const matchingTabs = allTabs.filter((tab) => {
      const url = tab.url;
      if (!url) return false;
      return !!matchPatterns.find((pattern) => pattern.includes(url));
    });
    await Promise.all(matchingTabs.map(async (tab) => {
      try {
        await browser.tabs.reload(tab.id);
      } catch (err) {
        logger.warn("Failed to reload tab:", err);
      }
    }));
  }
  async function reloadContentScriptMv2(_payload) {
    throw Error("TODO: reloadContentScriptMv2");
  }
  {
    try {
      const ws2 = getDevServerWebSocket();
      ws2.addWxtEventListener("wxt:reload-extension", () => {
        browser.runtime.reload();
      });
      ws2.addWxtEventListener("wxt:reload-content-script", (event) => {
        reloadContentScript(event.detail);
      });
      if (true) {
        ws2.addEventListener("open", () => ws2.sendCustom("wxt:background-initialized"));
        keepServiceWorkerAlive();
      }
    } catch (err) {
      logger.error("Failed to setup web socket connection with dev server", err);
    }
    browser.commands.onCommand.addListener((command) => {
      if (command === "wxt:reload-extension") browser.runtime.reload();
    });
  }
  let result;
  try {
    initPlugins();
    result = definition.main();
    if (result instanceof Promise) console.warn("The background's main() function return a promise, but it must be synchronous");
  } catch (err) {
    logger.error("The background crashed on startup!");
    throw err;
  }
  var background_entrypoint_default = result;
  return background_entrypoint_default;
})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1iYWNrZ3JvdW5kLm1qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb252ZXgvZGlzdC9lc20vaW5kZXguanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29udmV4L2Rpc3QvZXNtL3ZhbHVlcy9iYXNlNjQuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29udmV4L2Rpc3QvZXNtL2NvbW1vbi9pbmRleC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb252ZXgvZGlzdC9lc20vdmFsdWVzL3ZhbHVlLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvbnZleC9kaXN0L2VzbS92YWx1ZXMvZXJyb3JzLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvbnZleC9kaXN0L2VzbS92YWx1ZXMvY29tcGFyZV91dGY4LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvbnZleC9kaXN0L2VzbS9icm93c2VyL2xvZ2dpbmcuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29udmV4L2Rpc3QvZXNtL3NlcnZlci9mdW5jdGlvbk5hbWUuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29udmV4L2Rpc3QvZXNtL3NlcnZlci9jb21wb25lbnRzL3BhdGhzLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvbnZleC9kaXN0L2VzbS9zZXJ2ZXIvYXBpLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvbnZleC9kaXN0L2VzbS9icm93c2VyL2h0dHBfY2xpZW50LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvbnZleC9kaXN0L2VzbS9zZXJ2ZXIvY29tcG9uZW50cy9pbmRleC5qcyIsIi4uLy4uL2NvbnZleC9fZ2VuZXJhdGVkL2FwaS5qcyIsIi4uLy4uL3NyYy9saWIvZGV2aWNlLWlkLnRzIiwiLi4vLi4vc3JjL2xpYi90cmFuc2xhdGUudHMiLCIuLi8uLi9zcmMvbGliL3Byby1nYXRlLnRzIiwiLi4vLi4vZW50cnlwb2ludHMvYmFja2dyb3VuZC50cyIsIi4uLy4uL25vZGVfbW9kdWxlcy9Ad3h0LWRldi9icm93c2VyL3NyYy9pbmRleC5tanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvYnJvd3Nlci5tanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHdlYmV4dC1jb3JlL21hdGNoLXBhdHRlcm5zL2xpYi9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyNyZWdpb24gc3JjL3V0aWxzL2RlZmluZS1iYWNrZ3JvdW5kLnRzXG5mdW5jdGlvbiBkZWZpbmVCYWNrZ3JvdW5kKGFyZykge1xuXHRpZiAoYXJnID09IG51bGwgfHwgdHlwZW9mIGFyZyA9PT0gXCJmdW5jdGlvblwiKSByZXR1cm4geyBtYWluOiBhcmcgfTtcblx0cmV0dXJuIGFyZztcbn1cblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5leHBvcnQgY29uc3QgdmVyc2lvbiA9IFwiMS4zMi4wXCI7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIGxvb2t1cCA9IFtdO1xudmFyIHJldkxvb2t1cCA9IFtdO1xudmFyIEFyciA9IFVpbnQ4QXJyYXk7XG52YXIgY29kZSA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrL1wiO1xuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGNvZGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgbG9va3VwW2ldID0gY29kZVtpXTtcbiAgcmV2TG9va3VwW2NvZGUuY2hhckNvZGVBdChpKV0gPSBpO1xufVxucmV2TG9va3VwW1wiLVwiLmNoYXJDb2RlQXQoMCldID0gNjI7XG5yZXZMb29rdXBbXCJfXCIuY2hhckNvZGVBdCgwKV0gPSA2MztcbmZ1bmN0aW9uIGdldExlbnMoYjY0KSB7XG4gIHZhciBsZW4gPSBiNjQubGVuZ3RoO1xuICBpZiAobGVuICUgNCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0XCIpO1xuICB9XG4gIHZhciB2YWxpZExlbiA9IGI2NC5pbmRleE9mKFwiPVwiKTtcbiAgaWYgKHZhbGlkTGVuID09PSAtMSkgdmFsaWRMZW4gPSBsZW47XG4gIHZhciBwbGFjZUhvbGRlcnNMZW4gPSB2YWxpZExlbiA9PT0gbGVuID8gMCA6IDQgLSB2YWxpZExlbiAlIDQ7XG4gIHJldHVybiBbdmFsaWRMZW4sIHBsYWNlSG9sZGVyc0xlbl07XG59XG5leHBvcnQgZnVuY3Rpb24gYnl0ZUxlbmd0aChiNjQpIHtcbiAgdmFyIGxlbnMgPSBnZXRMZW5zKGI2NCk7XG4gIHZhciB2YWxpZExlbiA9IGxlbnNbMF07XG4gIHZhciBwbGFjZUhvbGRlcnNMZW4gPSBsZW5zWzFdO1xuICByZXR1cm4gKHZhbGlkTGVuICsgcGxhY2VIb2xkZXJzTGVuKSAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzTGVuO1xufVxuZnVuY3Rpb24gX2J5dGVMZW5ndGgoX2I2NCwgdmFsaWRMZW4sIHBsYWNlSG9sZGVyc0xlbikge1xuICByZXR1cm4gKHZhbGlkTGVuICsgcGxhY2VIb2xkZXJzTGVuKSAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzTGVuO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRvQnl0ZUFycmF5KGI2NCkge1xuICB2YXIgdG1wO1xuICB2YXIgbGVucyA9IGdldExlbnMoYjY0KTtcbiAgdmFyIHZhbGlkTGVuID0gbGVuc1swXTtcbiAgdmFyIHBsYWNlSG9sZGVyc0xlbiA9IGxlbnNbMV07XG4gIHZhciBhcnIgPSBuZXcgQXJyKF9ieXRlTGVuZ3RoKGI2NCwgdmFsaWRMZW4sIHBsYWNlSG9sZGVyc0xlbikpO1xuICB2YXIgY3VyQnl0ZSA9IDA7XG4gIHZhciBsZW4gPSBwbGFjZUhvbGRlcnNMZW4gPiAwID8gdmFsaWRMZW4gLSA0IDogdmFsaWRMZW47XG4gIHZhciBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpICs9IDQpIHtcbiAgICB0bXAgPSByZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSldIDw8IDE4IHwgcmV2TG9va3VwW2I2NC5jaGFyQ29kZUF0KGkgKyAxKV0gPDwgMTIgfCByZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSArIDIpXSA8PCA2IHwgcmV2TG9va3VwW2I2NC5jaGFyQ29kZUF0KGkgKyAzKV07XG4gICAgYXJyW2N1ckJ5dGUrK10gPSB0bXAgPj4gMTYgJiAyNTU7XG4gICAgYXJyW2N1ckJ5dGUrK10gPSB0bXAgPj4gOCAmIDI1NTtcbiAgICBhcnJbY3VyQnl0ZSsrXSA9IHRtcCAmIDI1NTtcbiAgfVxuICBpZiAocGxhY2VIb2xkZXJzTGVuID09PSAyKSB7XG4gICAgdG1wID0gcmV2TG9va3VwW2I2NC5jaGFyQ29kZUF0KGkpXSA8PCAyIHwgcmV2TG9va3VwW2I2NC5jaGFyQ29kZUF0KGkgKyAxKV0gPj4gNDtcbiAgICBhcnJbY3VyQnl0ZSsrXSA9IHRtcCAmIDI1NTtcbiAgfVxuICBpZiAocGxhY2VIb2xkZXJzTGVuID09PSAxKSB7XG4gICAgdG1wID0gcmV2TG9va3VwW2I2NC5jaGFyQ29kZUF0KGkpXSA8PCAxMCB8IHJldkxvb2t1cFtiNjQuY2hhckNvZGVBdChpICsgMSldIDw8IDQgfCByZXZMb29rdXBbYjY0LmNoYXJDb2RlQXQoaSArIDIpXSA+PiAyO1xuICAgIGFycltjdXJCeXRlKytdID0gdG1wID4+IDggJiAyNTU7XG4gICAgYXJyW2N1ckJ5dGUrK10gPSB0bXAgJiAyNTU7XG4gIH1cbiAgcmV0dXJuIGFycjtcbn1cbmZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NChudW0pIHtcbiAgcmV0dXJuIGxvb2t1cFtudW0gPj4gMTggJiA2M10gKyBsb29rdXBbbnVtID4+IDEyICYgNjNdICsgbG9va3VwW251bSA+PiA2ICYgNjNdICsgbG9va3VwW251bSAmIDYzXTtcbn1cbmZ1bmN0aW9uIGVuY29kZUNodW5rKHVpbnQ4LCBzdGFydCwgZW5kKSB7XG4gIHZhciB0bXA7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpICs9IDMpIHtcbiAgICB0bXAgPSAodWludDhbaV0gPDwgMTYgJiAxNjcxMTY4MCkgKyAodWludDhbaSArIDFdIDw8IDggJiA2NTI4MCkgKyAodWludDhbaSArIDJdICYgMjU1KTtcbiAgICBvdXRwdXQucHVzaCh0cmlwbGV0VG9CYXNlNjQodG1wKSk7XG4gIH1cbiAgcmV0dXJuIG91dHB1dC5qb2luKFwiXCIpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGZyb21CeXRlQXJyYXkodWludDgpIHtcbiAgdmFyIHRtcDtcbiAgdmFyIGxlbiA9IHVpbnQ4Lmxlbmd0aDtcbiAgdmFyIGV4dHJhQnl0ZXMgPSBsZW4gJSAzO1xuICB2YXIgcGFydHMgPSBbXTtcbiAgdmFyIG1heENodW5rTGVuZ3RoID0gMTYzODM7XG4gIGZvciAodmFyIGkgPSAwLCBsZW4yID0gbGVuIC0gZXh0cmFCeXRlczsgaSA8IGxlbjI7IGkgKz0gbWF4Q2h1bmtMZW5ndGgpIHtcbiAgICBwYXJ0cy5wdXNoKFxuICAgICAgZW5jb2RlQ2h1bmsoXG4gICAgICAgIHVpbnQ4LFxuICAgICAgICBpLFxuICAgICAgICBpICsgbWF4Q2h1bmtMZW5ndGggPiBsZW4yID8gbGVuMiA6IGkgKyBtYXhDaHVua0xlbmd0aFxuICAgICAgKVxuICAgICk7XG4gIH1cbiAgaWYgKGV4dHJhQnl0ZXMgPT09IDEpIHtcbiAgICB0bXAgPSB1aW50OFtsZW4gLSAxXTtcbiAgICBwYXJ0cy5wdXNoKGxvb2t1cFt0bXAgPj4gMl0gKyBsb29rdXBbdG1wIDw8IDQgJiA2M10gKyBcIj09XCIpO1xuICB9IGVsc2UgaWYgKGV4dHJhQnl0ZXMgPT09IDIpIHtcbiAgICB0bXAgPSAodWludDhbbGVuIC0gMl0gPDwgOCkgKyB1aW50OFtsZW4gLSAxXTtcbiAgICBwYXJ0cy5wdXNoKFxuICAgICAgbG9va3VwW3RtcCA+PiAxMF0gKyBsb29rdXBbdG1wID4+IDQgJiA2M10gKyBsb29rdXBbdG1wIDw8IDIgJiA2M10gKyBcIj1cIlxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHBhcnRzLmpvaW4oXCJcIik7XG59XG5leHBvcnQgZnVuY3Rpb24gZnJvbUJ5dGVBcnJheVVybFNhZmVOb1BhZGRpbmcodWludDgpIHtcbiAgcmV0dXJuIGZyb21CeXRlQXJyYXkodWludDgpLnJlcGxhY2UoL1xcKy9nLCBcIi1cIikucmVwbGFjZSgvXFwvL2csIFwiX1wiKS5yZXBsYWNlKC89L2csIFwiXCIpO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YmFzZTY0LmpzLm1hcFxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBcmdzKGFyZ3MpIHtcbiAgaWYgKGFyZ3MgPT09IHZvaWQgMCkge1xuICAgIHJldHVybiB7fTtcbiAgfVxuICBpZiAoIWlzU2ltcGxlT2JqZWN0KGFyZ3MpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYFRoZSBhcmd1bWVudHMgdG8gYSBDb252ZXggZnVuY3Rpb24gbXVzdCBiZSBhbiBvYmplY3QuIFJlY2VpdmVkOiAke2FyZ3N9YFxuICAgICk7XG4gIH1cbiAgcmV0dXJuIGFyZ3M7XG59XG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVEZXBsb3ltZW50VXJsKGRlcGxveW1lbnRVcmwpIHtcbiAgaWYgKHR5cGVvZiBkZXBsb3ltZW50VXJsID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYENsaWVudCBjcmVhdGVkIHdpdGggdW5kZWZpbmVkIGRlcGxveW1lbnQgYWRkcmVzcy4gSWYgeW91IHVzZWQgYW4gZW52aXJvbm1lbnQgdmFyaWFibGUsIGNoZWNrIHRoYXQgaXQncyBzZXQuYFxuICAgICk7XG4gIH1cbiAgaWYgKHR5cGVvZiBkZXBsb3ltZW50VXJsICE9PSBcInN0cmluZ1wiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYEludmFsaWQgZGVwbG95bWVudCBhZGRyZXNzOiBmb3VuZCAke2RlcGxveW1lbnRVcmx9XCIuYFxuICAgICk7XG4gIH1cbiAgaWYgKCEoZGVwbG95bWVudFVybC5zdGFydHNXaXRoKFwiaHR0cDpcIikgfHwgZGVwbG95bWVudFVybC5zdGFydHNXaXRoKFwiaHR0cHM6XCIpKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBJbnZhbGlkIGRlcGxveW1lbnQgYWRkcmVzczogTXVzdCBzdGFydCB3aXRoIFwiaHR0cHM6Ly9cIiBvciBcImh0dHA6Ly9cIi4gRm91bmQgXCIke2RlcGxveW1lbnRVcmx9XCIuYFxuICAgICk7XG4gIH1cbiAgdHJ5IHtcbiAgICBuZXcgVVJMKGRlcGxveW1lbnRVcmwpO1xuICB9IGNhdGNoIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgSW52YWxpZCBkZXBsb3ltZW50IGFkZHJlc3M6IFwiJHtkZXBsb3ltZW50VXJsfVwiIGlzIG5vdCBhIHZhbGlkIFVSTC4gSWYgeW91IGJlbGlldmUgdGhpcyBVUkwgaXMgY29ycmVjdCwgdXNlIHRoZSBcXGBza2lwQ29udmV4RGVwbG95bWVudFVybENoZWNrXFxgIG9wdGlvbiB0byBieXBhc3MgdGhpcy5gXG4gICAgKTtcbiAgfVxuICBpZiAoZGVwbG95bWVudFVybC5lbmRzV2l0aChcIi5jb252ZXguc2l0ZVwiKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBJbnZhbGlkIGRlcGxveW1lbnQgYWRkcmVzczogXCIke2RlcGxveW1lbnRVcmx9XCIgZW5kcyB3aXRoIC5jb252ZXguc2l0ZSwgd2hpY2ggaXMgdXNlZCBmb3IgSFRUUCBBY3Rpb25zLiBDb252ZXggZGVwbG95bWVudCBVUkxzIHR5cGljYWxseSBlbmQgd2l0aCAuY29udmV4LmNsb3VkPyBJZiB5b3UgYmVsaWV2ZSB0aGlzIFVSTCBpcyBjb3JyZWN0LCB1c2UgdGhlIFxcYHNraXBDb252ZXhEZXBsb3ltZW50VXJsQ2hlY2tcXGAgb3B0aW9uIHRvIGJ5cGFzcyB0aGlzLmBcbiAgICApO1xuICB9XG59XG5leHBvcnQgZnVuY3Rpb24gaXNTaW1wbGVPYmplY3QodmFsdWUpIHtcbiAgY29uc3QgaXNPYmplY3QgPSB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCI7XG4gIGNvbnN0IHByb3RvdHlwZSA9IE9iamVjdC5nZXRQcm90b3R5cGVPZih2YWx1ZSk7XG4gIGNvbnN0IGlzU2ltcGxlID0gcHJvdG90eXBlID09PSBudWxsIHx8IHByb3RvdHlwZSA9PT0gT2JqZWN0LnByb3RvdHlwZSB8fCAvLyBPYmplY3RzIGdlbmVyYXRlZCBmcm9tIG90aGVyIGNvbnRleHRzIChlLmcuIGFjcm9zcyBOb2RlLmpzIGB2bWAgbW9kdWxlcykgd2lsbCBub3Qgc2F0aXNmeSB0aGUgcHJldmlvdXNcbiAgLy8gY29uZGl0aW9ucyBidXQgYXJlIHN0aWxsIHNpbXBsZSBvYmplY3RzLlxuICBwcm90b3R5cGU/LmNvbnN0cnVjdG9yPy5uYW1lID09PSBcIk9iamVjdFwiO1xuICByZXR1cm4gaXNPYmplY3QgJiYgaXNTaW1wbGU7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xuaW1wb3J0ICogYXMgQmFzZTY0IGZyb20gXCIuL2Jhc2U2NC5qc1wiO1xuaW1wb3J0IHsgaXNTaW1wbGVPYmplY3QgfSBmcm9tIFwiLi4vY29tbW9uL2luZGV4LmpzXCI7XG5jb25zdCBMSVRUTEVfRU5ESUFOID0gdHJ1ZTtcbmNvbnN0IE1JTl9JTlQ2NCA9IEJpZ0ludChcIi05MjIzMzcyMDM2ODU0Nzc1ODA4XCIpO1xuY29uc3QgTUFYX0lOVDY0ID0gQmlnSW50KFwiOTIyMzM3MjAzNjg1NDc3NTgwN1wiKTtcbmNvbnN0IFpFUk8gPSBCaWdJbnQoXCIwXCIpO1xuY29uc3QgRUlHSFQgPSBCaWdJbnQoXCI4XCIpO1xuY29uc3QgVFdPRklGVFlTSVggPSBCaWdJbnQoXCIyNTZcIik7XG5mdW5jdGlvbiBpc1NwZWNpYWwobikge1xuICByZXR1cm4gTnVtYmVyLmlzTmFOKG4pIHx8ICFOdW1iZXIuaXNGaW5pdGUobikgfHwgT2JqZWN0LmlzKG4sIC0wKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzbG93QmlnSW50VG9CYXNlNjQodmFsdWUpIHtcbiAgaWYgKHZhbHVlIDwgWkVSTykge1xuICAgIHZhbHVlIC09IE1JTl9JTlQ2NCArIE1JTl9JTlQ2NDtcbiAgfVxuICBsZXQgaGV4ID0gdmFsdWUudG9TdHJpbmcoMTYpO1xuICBpZiAoaGV4Lmxlbmd0aCAlIDIgPT09IDEpIGhleCA9IFwiMFwiICsgaGV4O1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KG5ldyBBcnJheUJ1ZmZlcig4KSk7XG4gIGxldCBpID0gMDtcbiAgZm9yIChjb25zdCBoZXhCeXRlIG9mIGhleC5tYXRjaCgvLnsyfS9nKS5yZXZlcnNlKCkpIHtcbiAgICBieXRlcy5zZXQoW3BhcnNlSW50KGhleEJ5dGUsIDE2KV0sIGkrKyk7XG4gICAgdmFsdWUgPj49IEVJR0hUO1xuICB9XG4gIHJldHVybiBCYXNlNjQuZnJvbUJ5dGVBcnJheShieXRlcyk7XG59XG5leHBvcnQgZnVuY3Rpb24gc2xvd0Jhc2U2NFRvQmlnSW50KGVuY29kZWQpIHtcbiAgY29uc3QgaW50ZWdlckJ5dGVzID0gQmFzZTY0LnRvQnl0ZUFycmF5KGVuY29kZWQpO1xuICBpZiAoaW50ZWdlckJ5dGVzLmJ5dGVMZW5ndGggIT09IDgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgUmVjZWl2ZWQgJHtpbnRlZ2VyQnl0ZXMuYnl0ZUxlbmd0aH0gYnl0ZXMsIGV4cGVjdGVkIDggZm9yICRpbnRlZ2VyYFxuICAgICk7XG4gIH1cbiAgbGV0IHZhbHVlID0gWkVSTztcbiAgbGV0IHBvd2VyID0gWkVSTztcbiAgZm9yIChjb25zdCBieXRlIG9mIGludGVnZXJCeXRlcykge1xuICAgIHZhbHVlICs9IEJpZ0ludChieXRlKSAqIFRXT0ZJRlRZU0lYICoqIHBvd2VyO1xuICAgIHBvd2VyKys7XG4gIH1cbiAgaWYgKHZhbHVlID4gTUFYX0lOVDY0KSB7XG4gICAgdmFsdWUgKz0gTUlOX0lOVDY0ICsgTUlOX0lOVDY0O1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBtb2Rlcm5CaWdJbnRUb0Jhc2U2NCh2YWx1ZSkge1xuICBpZiAodmFsdWUgPCBNSU5fSU5UNjQgfHwgTUFYX0lOVDY0IDwgdmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgQmlnSW50ICR7dmFsdWV9IGRvZXMgbm90IGZpdCBpbnRvIGEgNjQtYml0IHNpZ25lZCBpbnRlZ2VyLmBcbiAgICApO1xuICB9XG4gIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcig4KTtcbiAgbmV3IERhdGFWaWV3KGJ1ZmZlcikuc2V0QmlnSW50NjQoMCwgdmFsdWUsIHRydWUpO1xuICByZXR1cm4gQmFzZTY0LmZyb21CeXRlQXJyYXkobmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSk7XG59XG5leHBvcnQgZnVuY3Rpb24gbW9kZXJuQmFzZTY0VG9CaWdJbnQoZW5jb2RlZCkge1xuICBjb25zdCBpbnRlZ2VyQnl0ZXMgPSBCYXNlNjQudG9CeXRlQXJyYXkoZW5jb2RlZCk7XG4gIGlmIChpbnRlZ2VyQnl0ZXMuYnl0ZUxlbmd0aCAhPT0gOCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBSZWNlaXZlZCAke2ludGVnZXJCeXRlcy5ieXRlTGVuZ3RofSBieXRlcywgZXhwZWN0ZWQgOCBmb3IgJGludGVnZXJgXG4gICAgKTtcbiAgfVxuICBjb25zdCBpbnRCeXRlc1ZpZXcgPSBuZXcgRGF0YVZpZXcoaW50ZWdlckJ5dGVzLmJ1ZmZlcik7XG4gIHJldHVybiBpbnRCeXRlc1ZpZXcuZ2V0QmlnSW50NjQoMCwgdHJ1ZSk7XG59XG5leHBvcnQgY29uc3QgYmlnSW50VG9CYXNlNjQgPSBEYXRhVmlldy5wcm90b3R5cGUuc2V0QmlnSW50NjQgPyBtb2Rlcm5CaWdJbnRUb0Jhc2U2NCA6IHNsb3dCaWdJbnRUb0Jhc2U2NDtcbmV4cG9ydCBjb25zdCBiYXNlNjRUb0JpZ0ludCA9IERhdGFWaWV3LnByb3RvdHlwZS5nZXRCaWdJbnQ2NCA/IG1vZGVybkJhc2U2NFRvQmlnSW50IDogc2xvd0Jhc2U2NFRvQmlnSW50O1xuY29uc3QgTUFYX0lERU5USUZJRVJfTEVOID0gMTAyNDtcbmZ1bmN0aW9uIHZhbGlkYXRlT2JqZWN0RmllbGQoaykge1xuICBpZiAoay5sZW5ndGggPiBNQVhfSURFTlRJRklFUl9MRU4pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRmllbGQgbmFtZSAke2t9IGV4Y2VlZHMgbWF4aW11bSBmaWVsZCBuYW1lIGxlbmd0aCAke01BWF9JREVOVElGSUVSX0xFTn0uYFxuICAgICk7XG4gIH1cbiAgaWYgKGsuc3RhcnRzV2l0aChcIiRcIikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZpZWxkIG5hbWUgJHtrfSBzdGFydHMgd2l0aCBhICckJywgd2hpY2ggaXMgcmVzZXJ2ZWQuYCk7XG4gIH1cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBrLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgY29uc3QgY2hhckNvZGUgPSBrLmNoYXJDb2RlQXQoaSk7XG4gICAgaWYgKGNoYXJDb2RlIDwgMzIgfHwgY2hhckNvZGUgPj0gMTI3KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBGaWVsZCBuYW1lICR7a30gaGFzIGludmFsaWQgY2hhcmFjdGVyICcke2tbaV19JzogRmllbGQgbmFtZXMgY2FuIG9ubHkgY29udGFpbiBub24tY29udHJvbCBBU0NJSSBjaGFyYWN0ZXJzYFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBqc29uVG9Db252ZXgodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gdmFsdWUubWFwKCh2YWx1ZTIpID0+IGpzb25Ub0NvbnZleCh2YWx1ZTIpKTtcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHR5cGUgb2YgJHt2YWx1ZX1gKTtcbiAgfVxuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXModmFsdWUpO1xuICBpZiAoZW50cmllcy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zdCBrZXkgPSBlbnRyaWVzWzBdWzBdO1xuICAgIGlmIChrZXkgPT09IFwiJGJ5dGVzXCIpIHtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUuJGJ5dGVzICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTWFsZm9ybWVkICRieXRlcyBmaWVsZCBvbiAke3ZhbHVlfWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEJhc2U2NC50b0J5dGVBcnJheSh2YWx1ZS4kYnl0ZXMpLmJ1ZmZlcjtcbiAgICB9XG4gICAgaWYgKGtleSA9PT0gXCIkaW50ZWdlclwiKSB7XG4gICAgICBpZiAodHlwZW9mIHZhbHVlLiRpbnRlZ2VyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTWFsZm9ybWVkICRpbnRlZ2VyIGZpZWxkIG9uICR7dmFsdWV9YCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYmFzZTY0VG9CaWdJbnQodmFsdWUuJGludGVnZXIpO1xuICAgIH1cbiAgICBpZiAoa2V5ID09PSBcIiRmbG9hdFwiKSB7XG4gICAgICBpZiAodHlwZW9mIHZhbHVlLiRmbG9hdCAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1hbGZvcm1lZCAkZmxvYXQgZmllbGQgb24gJHt2YWx1ZX1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZsb2F0Qnl0ZXMgPSBCYXNlNjQudG9CeXRlQXJyYXkodmFsdWUuJGZsb2F0KTtcbiAgICAgIGlmIChmbG9hdEJ5dGVzLmJ5dGVMZW5ndGggIT09IDgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBSZWNlaXZlZCAke2Zsb2F0Qnl0ZXMuYnl0ZUxlbmd0aH0gYnl0ZXMsIGV4cGVjdGVkIDggZm9yICRmbG9hdGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZsb2F0Qnl0ZXNWaWV3ID0gbmV3IERhdGFWaWV3KGZsb2F0Qnl0ZXMuYnVmZmVyKTtcbiAgICAgIGNvbnN0IGZsb2F0ID0gZmxvYXRCeXRlc1ZpZXcuZ2V0RmxvYXQ2NCgwLCBMSVRUTEVfRU5ESUFOKTtcbiAgICAgIGlmICghaXNTcGVjaWFsKGZsb2F0KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZsb2F0ICR7ZmxvYXR9IHNob3VsZCBiZSBlbmNvZGVkIGFzIGEgbnVtYmVyYCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmxvYXQ7XG4gICAgfVxuICAgIGlmIChrZXkgPT09IFwiJHNldFwiKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBSZWNlaXZlZCBhIFNldCB3aGljaCBpcyBubyBsb25nZXIgc3VwcG9ydGVkIGFzIGEgQ29udmV4IHR5cGUuYFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKGtleSA9PT0gXCIkbWFwXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFJlY2VpdmVkIGEgTWFwIHdoaWNoIGlzIG5vIGxvbmdlciBzdXBwb3J0ZWQgYXMgYSBDb252ZXggdHlwZS5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICBjb25zdCBvdXQgPSB7fTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUpKSB7XG4gICAgdmFsaWRhdGVPYmplY3RGaWVsZChrKTtcbiAgICBvdXRba10gPSBqc29uVG9Db252ZXgodik7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cbmNvbnN0IE1BWF9WQUxVRV9GT1JfRVJST1JfTEVOID0gMTYzODQ7XG5leHBvcnQgZnVuY3Rpb24gc3RyaW5naWZ5VmFsdWVGb3JFcnJvcih2YWx1ZSkge1xuICBjb25zdCBzdHIgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgKF9rZXksIHZhbHVlMikgPT4ge1xuICAgIGlmICh2YWx1ZTIgPT09IHZvaWQgMCkge1xuICAgICAgcmV0dXJuIFwidW5kZWZpbmVkXCI7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdmFsdWUyID09PSBcImJpZ2ludFwiKSB7XG4gICAgICByZXR1cm4gYCR7dmFsdWUyLnRvU3RyaW5nKCl9bmA7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTI7XG4gIH0pO1xuICBpZiAoc3RyLmxlbmd0aCA+IE1BWF9WQUxVRV9GT1JfRVJST1JfTEVOKSB7XG4gICAgY29uc3QgcmVzdCA9IFwiWy4uLnRydW5jYXRlZF1cIjtcbiAgICBsZXQgdHJ1bmNhdGVBdCA9IE1BWF9WQUxVRV9GT1JfRVJST1JfTEVOIC0gcmVzdC5sZW5ndGg7XG4gICAgY29uc3QgY29kZVBvaW50ID0gc3RyLmNvZGVQb2ludEF0KHRydW5jYXRlQXQgLSAxKTtcbiAgICBpZiAoY29kZVBvaW50ICE9PSB2b2lkIDAgJiYgY29kZVBvaW50ID4gNjU1MzUpIHtcbiAgICAgIHRydW5jYXRlQXQgLT0gMTtcbiAgICB9XG4gICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgdHJ1bmNhdGVBdCkgKyByZXN0O1xuICB9XG4gIHJldHVybiBzdHI7XG59XG5mdW5jdGlvbiBjb252ZXhUb0pzb25JbnRlcm5hbCh2YWx1ZSwgb3JpZ2luYWxWYWx1ZSwgY29udGV4dCwgaW5jbHVkZVRvcExldmVsVW5kZWZpbmVkKSB7XG4gIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgY29uc3QgY29udGV4dFRleHQgPSBjb250ZXh0ICYmIGAgKHByZXNlbnQgYXQgcGF0aCAke2NvbnRleHR9IGluIG9yaWdpbmFsIG9iamVjdCAke3N0cmluZ2lmeVZhbHVlRm9yRXJyb3IoXG4gICAgICBvcmlnaW5hbFZhbHVlXG4gICAgKX0pYDtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgdW5kZWZpbmVkIGlzIG5vdCBhIHZhbGlkIENvbnZleCB2YWx1ZSR7Y29udGV4dFRleHR9LiBUbyBsZWFybiBhYm91dCBDb252ZXgncyBzdXBwb3J0ZWQgdHlwZXMsIHNlZSBodHRwczovL2RvY3MuY29udmV4LmRldi91c2luZy90eXBlcy5gXG4gICAgKTtcbiAgfVxuICBpZiAodmFsdWUgPT09IG51bGwpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJiaWdpbnRcIikge1xuICAgIGlmICh2YWx1ZSA8IE1JTl9JTlQ2NCB8fCBNQVhfSU5UNjQgPCB2YWx1ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQmlnSW50ICR7dmFsdWV9IGRvZXMgbm90IGZpdCBpbnRvIGEgNjQtYml0IHNpZ25lZCBpbnRlZ2VyLmBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB7ICRpbnRlZ2VyOiBiaWdJbnRUb0Jhc2U2NCh2YWx1ZSkgfTtcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiKSB7XG4gICAgaWYgKGlzU3BlY2lhbCh2YWx1ZSkpIHtcbiAgICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcig4KTtcbiAgICAgIG5ldyBEYXRhVmlldyhidWZmZXIpLnNldEZsb2F0NjQoMCwgdmFsdWUsIExJVFRMRV9FTkRJQU4pO1xuICAgICAgcmV0dXJuIHsgJGZsb2F0OiBCYXNlNjQuZnJvbUJ5dGVBcnJheShuZXcgVWludDhBcnJheShidWZmZXIpKSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICByZXR1cm4geyAkYnl0ZXM6IEJhc2U2NC5mcm9tQnl0ZUFycmF5KG5ldyBVaW50OEFycmF5KHZhbHVlKSkgfTtcbiAgfVxuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICByZXR1cm4gdmFsdWUubWFwKFxuICAgICAgKHZhbHVlMiwgaSkgPT4gY29udmV4VG9Kc29uSW50ZXJuYWwodmFsdWUyLCBvcmlnaW5hbFZhbHVlLCBjb250ZXh0ICsgYFske2l9XWAsIGZhbHNlKVxuICAgICk7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgU2V0KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgZXJyb3JNZXNzYWdlRm9yVW5zdXBwb3J0ZWRUeXBlKGNvbnRleHQsIFwiU2V0XCIsIFsuLi52YWx1ZV0sIG9yaWdpbmFsVmFsdWUpXG4gICAgKTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBNYXApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBlcnJvck1lc3NhZ2VGb3JVbnN1cHBvcnRlZFR5cGUoY29udGV4dCwgXCJNYXBcIiwgWy4uLnZhbHVlXSwgb3JpZ2luYWxWYWx1ZSlcbiAgICApO1xuICB9XG4gIGlmICghaXNTaW1wbGVPYmplY3QodmFsdWUpKSB7XG4gICAgY29uc3QgdGhlVHlwZSA9IHZhbHVlPy5jb25zdHJ1Y3Rvcj8ubmFtZTtcbiAgICBjb25zdCB0eXBlTmFtZSA9IHRoZVR5cGUgPyBgJHt0aGVUeXBlfSBgIDogXCJcIjtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBlcnJvck1lc3NhZ2VGb3JVbnN1cHBvcnRlZFR5cGUoY29udGV4dCwgdHlwZU5hbWUsIHZhbHVlLCBvcmlnaW5hbFZhbHVlKVxuICAgICk7XG4gIH1cbiAgY29uc3Qgb3V0ID0ge307XG4gIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyh2YWx1ZSk7XG4gIGVudHJpZXMuc29ydCgoW2sxLCBfdjFdLCBbazIsIF92Ml0pID0+IGsxID09PSBrMiA/IDAgOiBrMSA8IGsyID8gLTEgOiAxKTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgZW50cmllcykge1xuICAgIGlmICh2ICE9PSB2b2lkIDApIHtcbiAgICAgIHZhbGlkYXRlT2JqZWN0RmllbGQoayk7XG4gICAgICBvdXRba10gPSBjb252ZXhUb0pzb25JbnRlcm5hbCh2LCBvcmlnaW5hbFZhbHVlLCBjb250ZXh0ICsgYC4ke2t9YCwgZmFsc2UpO1xuICAgIH0gZWxzZSBpZiAoaW5jbHVkZVRvcExldmVsVW5kZWZpbmVkKSB7XG4gICAgICB2YWxpZGF0ZU9iamVjdEZpZWxkKGspO1xuICAgICAgb3V0W2tdID0gY29udmV4T3JVbmRlZmluZWRUb0pzb25JbnRlcm5hbChcbiAgICAgICAgdixcbiAgICAgICAgb3JpZ2luYWxWYWx1ZSxcbiAgICAgICAgY29udGV4dCArIGAuJHtrfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5mdW5jdGlvbiBlcnJvck1lc3NhZ2VGb3JVbnN1cHBvcnRlZFR5cGUoY29udGV4dCwgdHlwZU5hbWUsIHZhbHVlLCBvcmlnaW5hbFZhbHVlKSB7XG4gIGlmIChjb250ZXh0KSB7XG4gICAgcmV0dXJuIGAke3R5cGVOYW1lfSR7c3RyaW5naWZ5VmFsdWVGb3JFcnJvcihcbiAgICAgIHZhbHVlXG4gICAgKX0gaXMgbm90IGEgc3VwcG9ydGVkIENvbnZleCB0eXBlIChwcmVzZW50IGF0IHBhdGggJHtjb250ZXh0fSBpbiBvcmlnaW5hbCBvYmplY3QgJHtzdHJpbmdpZnlWYWx1ZUZvckVycm9yKFxuICAgICAgb3JpZ2luYWxWYWx1ZVxuICAgICl9KS4gVG8gbGVhcm4gYWJvdXQgQ29udmV4J3Mgc3VwcG9ydGVkIHR5cGVzLCBzZWUgaHR0cHM6Ly9kb2NzLmNvbnZleC5kZXYvdXNpbmcvdHlwZXMuYDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYCR7dHlwZU5hbWV9JHtzdHJpbmdpZnlWYWx1ZUZvckVycm9yKFxuICAgICAgdmFsdWVcbiAgICApfSBpcyBub3QgYSBzdXBwb3J0ZWQgQ29udmV4IHR5cGUuYDtcbiAgfVxufVxuZnVuY3Rpb24gY29udmV4T3JVbmRlZmluZWRUb0pzb25JbnRlcm5hbCh2YWx1ZSwgb3JpZ2luYWxWYWx1ZSwgY29udGV4dCkge1xuICBpZiAodmFsdWUgPT09IHZvaWQgMCkge1xuICAgIHJldHVybiB7ICR1bmRlZmluZWQ6IG51bGwgfTtcbiAgfSBlbHNlIHtcbiAgICBpZiAob3JpZ2luYWxWYWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBQcm9ncmFtbWluZyBlcnJvci4gQ3VycmVudCB2YWx1ZSBpcyAke3N0cmluZ2lmeVZhbHVlRm9yRXJyb3IoXG4gICAgICAgICAgdmFsdWVcbiAgICAgICAgKX0gYnV0IG9yaWdpbmFsIHZhbHVlIGlzIHVuZGVmaW5lZGBcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBjb252ZXhUb0pzb25JbnRlcm5hbCh2YWx1ZSwgb3JpZ2luYWxWYWx1ZSwgY29udGV4dCwgZmFsc2UpO1xuICB9XG59XG5leHBvcnQgZnVuY3Rpb24gY29udmV4VG9Kc29uKHZhbHVlKSB7XG4gIHJldHVybiBjb252ZXhUb0pzb25JbnRlcm5hbCh2YWx1ZSwgdmFsdWUsIFwiXCIsIGZhbHNlKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXhPclVuZGVmaW5lZFRvSnNvbih2YWx1ZSkge1xuICByZXR1cm4gY29udmV4T3JVbmRlZmluZWRUb0pzb25JbnRlcm5hbCh2YWx1ZSwgdmFsdWUsIFwiXCIpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHBhdGNoVmFsdWVUb0pzb24odmFsdWUpIHtcbiAgcmV0dXJuIGNvbnZleFRvSnNvbkludGVybmFsKHZhbHVlLCB2YWx1ZSwgXCJcIiwgdHJ1ZSk7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD12YWx1ZS5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2RlZk5vcm1hbFByb3AgPSAob2JqLCBrZXksIHZhbHVlKSA9PiBrZXkgaW4gb2JqID8gX19kZWZQcm9wKG9iaiwga2V5LCB7IGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgd3JpdGFibGU6IHRydWUsIHZhbHVlIH0pIDogb2JqW2tleV0gPSB2YWx1ZTtcbnZhciBfX3B1YmxpY0ZpZWxkID0gKG9iaiwga2V5LCB2YWx1ZSkgPT4gX19kZWZOb3JtYWxQcm9wKG9iaiwgdHlwZW9mIGtleSAhPT0gXCJzeW1ib2xcIiA/IGtleSArIFwiXCIgOiBrZXksIHZhbHVlKTtcbnZhciBfYSwgX2I7XG5pbXBvcnQgeyBzdHJpbmdpZnlWYWx1ZUZvckVycm9yIH0gZnJvbSBcIi4vdmFsdWUuanNcIjtcbmNvbnN0IElERU5USUZZSU5HX0ZJRUxEID0gU3ltYm9sLmZvcihcIkNvbnZleEVycm9yXCIpO1xuZXhwb3J0IGNsYXNzIENvbnZleEVycm9yIGV4dGVuZHMgKF9iID0gRXJyb3IsIF9hID0gSURFTlRJRllJTkdfRklFTEQsIF9iKSB7XG4gIGNvbnN0cnVjdG9yKGRhdGEpIHtcbiAgICBzdXBlcih0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiA/IGRhdGEgOiBzdHJpbmdpZnlWYWx1ZUZvckVycm9yKGRhdGEpKTtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwibmFtZVwiLCBcIkNvbnZleEVycm9yXCIpO1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJkYXRhXCIpO1xuICAgIF9fcHVibGljRmllbGQodGhpcywgX2EsIHRydWUpO1xuICAgIHRoaXMuZGF0YSA9IGRhdGE7XG4gIH1cbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWVycm9ycy5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBhcmVVVEY4KGEsIGIpIHtcbiAgY29uc3QgYUxlbmd0aCA9IGEubGVuZ3RoO1xuICBjb25zdCBiTGVuZ3RoID0gYi5sZW5ndGg7XG4gIGNvbnN0IGxlbmd0aCA9IE1hdGgubWluKGFMZW5ndGgsIGJMZW5ndGgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgKSB7XG4gICAgY29uc3QgYUNvZGVQb2ludCA9IGEuY29kZVBvaW50QXQoaSk7XG4gICAgY29uc3QgYkNvZGVQb2ludCA9IGIuY29kZVBvaW50QXQoaSk7XG4gICAgaWYgKGFDb2RlUG9pbnQgIT09IGJDb2RlUG9pbnQpIHtcbiAgICAgIGlmIChhQ29kZVBvaW50IDwgMTI4ICYmIGJDb2RlUG9pbnQgPCAxMjgpIHtcbiAgICAgICAgcmV0dXJuIGFDb2RlUG9pbnQgLSBiQ29kZVBvaW50O1xuICAgICAgfVxuICAgICAgY29uc3QgYUxlbmd0aDIgPSB1dGY4Qnl0ZXMoYUNvZGVQb2ludCwgYUJ5dGVzKTtcbiAgICAgIGNvbnN0IGJMZW5ndGgyID0gdXRmOEJ5dGVzKGJDb2RlUG9pbnQsIGJCeXRlcyk7XG4gICAgICByZXR1cm4gY29tcGFyZUFycmF5cyhhQnl0ZXMsIGFMZW5ndGgyLCBiQnl0ZXMsIGJMZW5ndGgyKTtcbiAgICB9XG4gICAgaSArPSB1dGYxNkxlbmd0aEZvckNvZGVQb2ludChhQ29kZVBvaW50KTtcbiAgfVxuICByZXR1cm4gYUxlbmd0aCAtIGJMZW5ndGg7XG59XG5mdW5jdGlvbiBjb21wYXJlQXJyYXlzKGEsIGFMZW5ndGgsIGIsIGJMZW5ndGgpIHtcbiAgY29uc3QgbGVuZ3RoID0gTWF0aC5taW4oYUxlbmd0aCwgYkxlbmd0aCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBhVmFsdWUgPSBhW2ldO1xuICAgIGNvbnN0IGJWYWx1ZSA9IGJbaV07XG4gICAgaWYgKGFWYWx1ZSAhPT0gYlZhbHVlKSB7XG4gICAgICByZXR1cm4gYVZhbHVlIC0gYlZhbHVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYUxlbmd0aCAtIGJMZW5ndGg7XG59XG5leHBvcnQgZnVuY3Rpb24gdXRmMTZMZW5ndGhGb3JDb2RlUG9pbnQoYUNvZGVQb2ludCkge1xuICByZXR1cm4gYUNvZGVQb2ludCA+IDY1NTM1ID8gMiA6IDE7XG59XG5jb25zdCBhcnIgPSAoKSA9PiBBcnJheS5mcm9tKHsgbGVuZ3RoOiA0IH0sICgpID0+IDApO1xuY29uc3QgYUJ5dGVzID0gYXJyKCk7XG5jb25zdCBiQnl0ZXMgPSBhcnIoKTtcbmZ1bmN0aW9uIHV0ZjhCeXRlcyhjb2RlUG9pbnQsIGJ5dGVzKSB7XG4gIGlmIChjb2RlUG9pbnQgPCAxMjgpIHtcbiAgICBieXRlc1swXSA9IGNvZGVQb2ludDtcbiAgICByZXR1cm4gMTtcbiAgfVxuICBsZXQgY291bnQ7XG4gIGxldCBvZmZzZXQ7XG4gIGlmIChjb2RlUG9pbnQgPD0gMjA0Nykge1xuICAgIGNvdW50ID0gMTtcbiAgICBvZmZzZXQgPSAxOTI7XG4gIH0gZWxzZSBpZiAoY29kZVBvaW50IDw9IDY1NTM1KSB7XG4gICAgY291bnQgPSAyO1xuICAgIG9mZnNldCA9IDIyNDtcbiAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPD0gMTExNDExMSkge1xuICAgIGNvdW50ID0gMztcbiAgICBvZmZzZXQgPSAyNDA7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBjb2RlIHBvaW50XCIpO1xuICB9XG4gIGJ5dGVzWzBdID0gKGNvZGVQb2ludCA+PiA2ICogY291bnQpICsgb2Zmc2V0O1xuICBsZXQgaSA9IDE7XG4gIGZvciAoOyBjb3VudCA+IDA7IGNvdW50LS0pIHtcbiAgICBjb25zdCB0ZW1wID0gY29kZVBvaW50ID4+IDYgKiAoY291bnQgLSAxKTtcbiAgICBieXRlc1tpKytdID0gMTI4IHwgdGVtcCAmIDYzO1xuICB9XG4gIHJldHVybiBpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdyZWF0ZXJUaGFuKGEsIGIpIHtcbiAgcmV0dXJuIGNvbXBhcmVVVEY4KGEsIGIpID4gMDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBncmVhdGVyVGhhbkVxKGEsIGIpIHtcbiAgcmV0dXJuIGNvbXBhcmVVVEY4KGEsIGIpID49IDA7XG59XG5leHBvcnQgZnVuY3Rpb24gbGVzc1RoYW4oYSwgYikge1xuICByZXR1cm4gY29tcGFyZVVURjgoYSwgYikgPCAwO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGxlc3NUaGFuRXEoYSwgYikge1xuICByZXR1cm4gY29tcGFyZVVURjgoYSwgYikgPD0gMDtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWNvbXBhcmVfdXRmOC5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2RlZk5vcm1hbFByb3AgPSAob2JqLCBrZXksIHZhbHVlKSA9PiBrZXkgaW4gb2JqID8gX19kZWZQcm9wKG9iaiwga2V5LCB7IGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgd3JpdGFibGU6IHRydWUsIHZhbHVlIH0pIDogb2JqW2tleV0gPSB2YWx1ZTtcbnZhciBfX3B1YmxpY0ZpZWxkID0gKG9iaiwga2V5LCB2YWx1ZSkgPT4gX19kZWZOb3JtYWxQcm9wKG9iaiwgdHlwZW9mIGtleSAhPT0gXCJzeW1ib2xcIiA/IGtleSArIFwiXCIgOiBrZXksIHZhbHVlKTtcbmNvbnN0IElORk9fQ09MT1IgPSBcImNvbG9yOnJnYigwLCAxNDUsIDI1NSlcIjtcbmZ1bmN0aW9uIHByZWZpeF9mb3Jfc291cmNlKHNvdXJjZSkge1xuICBzd2l0Y2ggKHNvdXJjZSkge1xuICAgIGNhc2UgXCJxdWVyeVwiOlxuICAgICAgcmV0dXJuIFwiUVwiO1xuICAgIGNhc2UgXCJtdXRhdGlvblwiOlxuICAgICAgcmV0dXJuIFwiTVwiO1xuICAgIGNhc2UgXCJhY3Rpb25cIjpcbiAgICAgIHJldHVybiBcIkFcIjtcbiAgICBjYXNlIFwiYW55XCI6XG4gICAgICByZXR1cm4gXCI/XCI7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBEZWZhdWx0TG9nZ2VyIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJfb25Mb2dMaW5lRnVuY3NcIik7XG4gICAgX19wdWJsaWNGaWVsZCh0aGlzLCBcIl92ZXJib3NlXCIpO1xuICAgIHRoaXMuX29uTG9nTGluZUZ1bmNzID0ge307XG4gICAgdGhpcy5fdmVyYm9zZSA9IG9wdGlvbnMudmVyYm9zZTtcbiAgfVxuICBhZGRMb2dMaW5lTGlzdGVuZXIoZnVuYykge1xuICAgIGxldCBpZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCAxNSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG4gICAgICBpZiAodGhpcy5fb25Mb2dMaW5lRnVuY3NbaWRdID09PSB2b2lkIDApIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCAxNSk7XG4gICAgfVxuICAgIHRoaXMuX29uTG9nTGluZUZ1bmNzW2lkXSA9IGZ1bmM7XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIGRlbGV0ZSB0aGlzLl9vbkxvZ0xpbmVGdW5jc1tpZF07XG4gICAgfTtcbiAgfVxuICBsb2dWZXJib3NlKC4uLmFyZ3MpIHtcbiAgICBpZiAodGhpcy5fdmVyYm9zZSkge1xuICAgICAgZm9yIChjb25zdCBmdW5jIG9mIE9iamVjdC52YWx1ZXModGhpcy5fb25Mb2dMaW5lRnVuY3MpKSB7XG4gICAgICAgIGZ1bmMoXCJkZWJ1Z1wiLCBgJHsoLyogQF9fUFVSRV9fICovIG5ldyBEYXRlKCkpLnRvSVNPU3RyaW5nKCl9YCwgLi4uYXJncyk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGxvZyguLi5hcmdzKSB7XG4gICAgZm9yIChjb25zdCBmdW5jIG9mIE9iamVjdC52YWx1ZXModGhpcy5fb25Mb2dMaW5lRnVuY3MpKSB7XG4gICAgICBmdW5jKFwiaW5mb1wiLCAuLi5hcmdzKTtcbiAgICB9XG4gIH1cbiAgd2FybiguLi5hcmdzKSB7XG4gICAgZm9yIChjb25zdCBmdW5jIG9mIE9iamVjdC52YWx1ZXModGhpcy5fb25Mb2dMaW5lRnVuY3MpKSB7XG4gICAgICBmdW5jKFwid2FyblwiLCAuLi5hcmdzKTtcbiAgICB9XG4gIH1cbiAgZXJyb3IoLi4uYXJncykge1xuICAgIGZvciAoY29uc3QgZnVuYyBvZiBPYmplY3QudmFsdWVzKHRoaXMuX29uTG9nTGluZUZ1bmNzKSkge1xuICAgICAgZnVuYyhcImVycm9yXCIsIC4uLmFyZ3MpO1xuICAgIH1cbiAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbnRpYXRlRGVmYXVsdExvZ2dlcihvcHRpb25zKSB7XG4gIGNvbnN0IGxvZ2dlciA9IG5ldyBEZWZhdWx0TG9nZ2VyKG9wdGlvbnMpO1xuICBsb2dnZXIuYWRkTG9nTGluZUxpc3RlbmVyKChsZXZlbCwgLi4uYXJncykgPT4ge1xuICAgIHN3aXRjaCAobGV2ZWwpIHtcbiAgICAgIGNhc2UgXCJkZWJ1Z1wiOlxuICAgICAgICBjb25zb2xlLmRlYnVnKC4uLmFyZ3MpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJpbmZvXCI6XG4gICAgICAgIGNvbnNvbGUubG9nKC4uLmFyZ3MpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJ3YXJuXCI6XG4gICAgICAgIGNvbnNvbGUud2FybiguLi5hcmdzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiZXJyb3JcIjpcbiAgICAgICAgY29uc29sZS5lcnJvciguLi5hcmdzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OiB7XG4gICAgICAgIGxldmVsO1xuICAgICAgICBjb25zb2xlLmxvZyguLi5hcmdzKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gbG9nZ2VyO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbnRpYXRlTm9vcExvZ2dlcihvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgRGVmYXVsdExvZ2dlcihvcHRpb25zKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBsb2dGb3JGdW5jdGlvbihsb2dnZXIsIHR5cGUsIHNvdXJjZSwgdWRmUGF0aCwgbWVzc2FnZSkge1xuICBjb25zdCBwcmVmaXggPSBwcmVmaXhfZm9yX3NvdXJjZShzb3VyY2UpO1xuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09IFwib2JqZWN0XCIpIHtcbiAgICBtZXNzYWdlID0gYENvbnZleEVycm9yICR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZS5lcnJvckRhdGEsIG51bGwsIDIpfWA7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFwiaW5mb1wiKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBtZXNzYWdlLm1hdGNoKC9eXFxbLio/XFxdIC8pO1xuICAgIGlmIChtYXRjaCA9PT0gbnVsbCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgW0NPTlZFWCAke3ByZWZpeH0oJHt1ZGZQYXRofSldIENvdWxkIG5vdCBwYXJzZSBjb25zb2xlLmxvZ2BcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGxldmVsID0gbWVzc2FnZS5zbGljZSgxLCBtYXRjaFswXS5sZW5ndGggLSAyKTtcbiAgICBjb25zdCBhcmdzID0gbWVzc2FnZS5zbGljZShtYXRjaFswXS5sZW5ndGgpO1xuICAgIGxvZ2dlci5sb2coYCVjW0NPTlZFWCAke3ByZWZpeH0oJHt1ZGZQYXRofSldIFske2xldmVsfV1gLCBJTkZPX0NPTE9SLCBhcmdzKTtcbiAgfSBlbHNlIHtcbiAgICBsb2dnZXIuZXJyb3IoYFtDT05WRVggJHtwcmVmaXh9KCR7dWRmUGF0aH0pXSAke21lc3NhZ2V9YCk7XG4gIH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBsb2dGYXRhbEVycm9yKGxvZ2dlciwgbWVzc2FnZSkge1xuICBjb25zdCBlcnJvck1lc3NhZ2UgPSBgW0NPTlZFWCBGQVRBTCBFUlJPUl0gJHttZXNzYWdlfWA7XG4gIGxvZ2dlci5lcnJvcihlcnJvck1lc3NhZ2UpO1xuICByZXR1cm4gbmV3IEVycm9yKGVycm9yTWVzc2FnZSk7XG59XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSHlicmlkRXJyb3JTdGFja3RyYWNlKHNvdXJjZSwgdWRmUGF0aCwgcmVzdWx0KSB7XG4gIGNvbnN0IHByZWZpeCA9IHByZWZpeF9mb3Jfc291cmNlKHNvdXJjZSk7XG4gIHJldHVybiBgW0NPTlZFWCAke3ByZWZpeH0oJHt1ZGZQYXRofSldICR7cmVzdWx0LmVycm9yTWVzc2FnZX1cbiAgQ2FsbGVkIGJ5IGNsaWVudGA7XG59XG5leHBvcnQgZnVuY3Rpb24gZm9yd2FyZERhdGEocmVzdWx0LCBlcnJvcikge1xuICBlcnJvci5kYXRhID0gcmVzdWx0LmVycm9yRGF0YTtcbiAgcmV0dXJuIGVycm9yO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bG9nZ2luZy5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xuZXhwb3J0IGNvbnN0IGZ1bmN0aW9uTmFtZSA9IFN5bWJvbC5mb3IoXCJmdW5jdGlvbk5hbWVcIik7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1mdW5jdGlvbk5hbWUuanMubWFwXG4iLCJcInVzZSBzdHJpY3RcIjtcbmltcG9ydCB7IGZ1bmN0aW9uTmFtZSB9IGZyb20gXCIuLi9mdW5jdGlvbk5hbWUuanNcIjtcbmV4cG9ydCBjb25zdCB0b1JlZmVyZW5jZVBhdGggPSBTeW1ib2wuZm9yKFwidG9SZWZlcmVuY2VQYXRoXCIpO1xuZXhwb3J0IGZ1bmN0aW9uIHNldFJlZmVyZW5jZVBhdGgob2JqLCB2YWx1ZSkge1xuICBvYmpbdG9SZWZlcmVuY2VQYXRoXSA9IHZhbHVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RSZWZlcmVuY2VQYXRoKHJlZmVyZW5jZSkge1xuICByZXR1cm4gcmVmZXJlbmNlW3RvUmVmZXJlbmNlUGF0aF0gPz8gbnVsbDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBpc0Z1bmN0aW9uSGFuZGxlKHMpIHtcbiAgcmV0dXJuIHMuc3RhcnRzV2l0aChcImZ1bmN0aW9uOi8vXCIpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uQWRkcmVzcyhmdW5jdGlvblJlZmVyZW5jZSkge1xuICBsZXQgZnVuY3Rpb25BZGRyZXNzO1xuICBpZiAodHlwZW9mIGZ1bmN0aW9uUmVmZXJlbmNlID09PSBcInN0cmluZ1wiKSB7XG4gICAgaWYgKGlzRnVuY3Rpb25IYW5kbGUoZnVuY3Rpb25SZWZlcmVuY2UpKSB7XG4gICAgICBmdW5jdGlvbkFkZHJlc3MgPSB7IGZ1bmN0aW9uSGFuZGxlOiBmdW5jdGlvblJlZmVyZW5jZSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBmdW5jdGlvbkFkZHJlc3MgPSB7IG5hbWU6IGZ1bmN0aW9uUmVmZXJlbmNlIH07XG4gICAgfVxuICB9IGVsc2UgaWYgKGZ1bmN0aW9uUmVmZXJlbmNlW2Z1bmN0aW9uTmFtZV0pIHtcbiAgICBmdW5jdGlvbkFkZHJlc3MgPSB7IG5hbWU6IGZ1bmN0aW9uUmVmZXJlbmNlW2Z1bmN0aW9uTmFtZV0gfTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByZWZlcmVuY2VQYXRoID0gZXh0cmFjdFJlZmVyZW5jZVBhdGgoZnVuY3Rpb25SZWZlcmVuY2UpO1xuICAgIGlmICghcmVmZXJlbmNlUGF0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2Z1bmN0aW9uUmVmZXJlbmNlfSBpcyBub3QgYSBmdW5jdGlvblJlZmVyZW5jZWApO1xuICAgIH1cbiAgICBmdW5jdGlvbkFkZHJlc3MgPSB7IHJlZmVyZW5jZTogcmVmZXJlbmNlUGF0aCB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbkFkZHJlc3M7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1wYXRocy5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xuaW1wb3J0IHsgZnVuY3Rpb25OYW1lIH0gZnJvbSBcIi4vZnVuY3Rpb25OYW1lLmpzXCI7XG5pbXBvcnQgeyBnZXRGdW5jdGlvbkFkZHJlc3MgfSBmcm9tIFwiLi9jb21wb25lbnRzL3BhdGhzLmpzXCI7XG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lKGZ1bmN0aW9uUmVmZXJlbmNlKSB7XG4gIGNvbnN0IGFkZHJlc3MgPSBnZXRGdW5jdGlvbkFkZHJlc3MoZnVuY3Rpb25SZWZlcmVuY2UpO1xuICBpZiAoYWRkcmVzcy5uYW1lID09PSB2b2lkIDApIHtcbiAgICBpZiAoYWRkcmVzcy5mdW5jdGlvbkhhbmRsZSAhPT0gdm9pZCAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBFeHBlY3RlZCBmdW5jdGlvbiByZWZlcmVuY2UgbGlrZSBcImFwaS5maWxlLmZ1bmNcIiBvciBcImludGVybmFsLmZpbGUuZnVuY1wiLCBidXQgcmVjZWl2ZWQgZnVuY3Rpb24gaGFuZGxlICR7YWRkcmVzcy5mdW5jdGlvbkhhbmRsZX1gXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAoYWRkcmVzcy5yZWZlcmVuY2UgIT09IHZvaWQgMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgRXhwZWN0ZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGluIHRoZSBjdXJyZW50IGNvbXBvbmVudCBsaWtlIFwiYXBpLmZpbGUuZnVuY1wiIG9yIFwiaW50ZXJuYWwuZmlsZS5mdW5jXCIsIGJ1dCByZWNlaXZlZCByZWZlcmVuY2UgJHthZGRyZXNzLnJlZmVyZW5jZX1gXG4gICAgICApO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRXhwZWN0ZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGxpa2UgXCJhcGkuZmlsZS5mdW5jXCIgb3IgXCJpbnRlcm5hbC5maWxlLmZ1bmNcIiwgYnV0IHJlY2VpdmVkICR7SlNPTi5zdHJpbmdpZnkoYWRkcmVzcyl9YFxuICAgICk7XG4gIH1cbiAgaWYgKHR5cGVvZiBmdW5jdGlvblJlZmVyZW5jZSA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIGZ1bmN0aW9uUmVmZXJlbmNlO1xuICBjb25zdCBuYW1lID0gZnVuY3Rpb25SZWZlcmVuY2VbZnVuY3Rpb25OYW1lXTtcbiAgaWYgKCFuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGAke2Z1bmN0aW9uUmVmZXJlbmNlfSBpcyBub3QgYSBmdW5jdGlvblJlZmVyZW5jZWApO1xuICB9XG4gIHJldHVybiBuYW1lO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VGdW5jdGlvblJlZmVyZW5jZShuYW1lKSB7XG4gIHJldHVybiB7IFtmdW5jdGlvbk5hbWVdOiBuYW1lIH07XG59XG5mdW5jdGlvbiBjcmVhdGVBcGkocGF0aFBhcnRzID0gW10pIHtcbiAgY29uc3QgaGFuZGxlciA9IHtcbiAgICBnZXQoXywgcHJvcCkge1xuICAgICAgaWYgKHR5cGVvZiBwcm9wID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGNvbnN0IG5ld1BhcnRzID0gWy4uLnBhdGhQYXJ0cywgcHJvcF07XG4gICAgICAgIHJldHVybiBjcmVhdGVBcGkobmV3UGFydHMpO1xuICAgICAgfSBlbHNlIGlmIChwcm9wID09PSBmdW5jdGlvbk5hbWUpIHtcbiAgICAgICAgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgY29uc3QgZm91bmQgPSBbXCJhcGlcIiwgLi4ucGF0aFBhcnRzXS5qb2luKFwiLlwiKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgQVBJIHBhdGggaXMgZXhwZWN0ZWQgdG8gYmUgb2YgdGhlIGZvcm0gXFxgYXBpLm1vZHVsZU5hbWUuZnVuY3Rpb25OYW1lXFxgLiBGb3VuZDogXFxgJHtmb3VuZH1cXGBgXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXRoID0gcGF0aFBhcnRzLnNsaWNlKDAsIC0xKS5qb2luKFwiL1wiKTtcbiAgICAgICAgY29uc3QgZXhwb3J0TmFtZSA9IHBhdGhQYXJ0c1twYXRoUGFydHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGlmIChleHBvcnROYW1lID09PSBcImRlZmF1bHRcIikge1xuICAgICAgICAgIHJldHVybiBwYXRoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBwYXRoICsgXCI6XCIgKyBleHBvcnROYW1lO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHByb3AgPT09IFN5bWJvbC50b1N0cmluZ1RhZykge1xuICAgICAgICByZXR1cm4gXCJGdW5jdGlvblJlZmVyZW5jZVwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIHJldHVybiBuZXcgUHJveHkoe30sIGhhbmRsZXIpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlckFwaShhcGkpIHtcbiAgcmV0dXJuIGFwaTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBqdXN0SW50ZXJuYWwoYXBpKSB7XG4gIHJldHVybiBhcGk7XG59XG5leHBvcnQgZnVuY3Rpb24ganVzdFB1YmxpYyhhcGkpIHtcbiAgcmV0dXJuIGFwaTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBqdXN0UXVlcmllcyhhcGkpIHtcbiAgcmV0dXJuIGFwaTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBqdXN0TXV0YXRpb25zKGFwaSkge1xuICByZXR1cm4gYXBpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGp1c3RBY3Rpb25zKGFwaSkge1xuICByZXR1cm4gYXBpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGp1c3RQYWdpbmF0ZWRRdWVyaWVzKGFwaSkge1xuICByZXR1cm4gYXBpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGp1c3RTY2hlZHVsYWJsZShhcGkpIHtcbiAgcmV0dXJuIGFwaTtcbn1cbmV4cG9ydCBjb25zdCBhbnlBcGkgPSBjcmVhdGVBcGkoKTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwaS5qcy5tYXBcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2RlZk5vcm1hbFByb3AgPSAob2JqLCBrZXksIHZhbHVlKSA9PiBrZXkgaW4gb2JqID8gX19kZWZQcm9wKG9iaiwga2V5LCB7IGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgd3JpdGFibGU6IHRydWUsIHZhbHVlIH0pIDogb2JqW2tleV0gPSB2YWx1ZTtcbnZhciBfX3B1YmxpY0ZpZWxkID0gKG9iaiwga2V5LCB2YWx1ZSkgPT4gX19kZWZOb3JtYWxQcm9wKG9iaiwgdHlwZW9mIGtleSAhPT0gXCJzeW1ib2xcIiA/IGtleSArIFwiXCIgOiBrZXksIHZhbHVlKTtcbmltcG9ydCB7XG4gIGdldEZ1bmN0aW9uTmFtZVxufSBmcm9tIFwiLi4vc2VydmVyL2FwaS5qc1wiO1xuaW1wb3J0IHsgcGFyc2VBcmdzLCB2YWxpZGF0ZURlcGxveW1lbnRVcmwgfSBmcm9tIFwiLi4vY29tbW9uL2luZGV4LmpzXCI7XG5pbXBvcnQgeyB2ZXJzaW9uIH0gZnJvbSBcIi4uL2luZGV4LmpzXCI7XG5pbXBvcnQge1xuICBDb252ZXhFcnJvcixcbiAgY29udmV4VG9Kc29uLFxuICBqc29uVG9Db252ZXhcbn0gZnJvbSBcIi4uL3ZhbHVlcy9pbmRleC5qc1wiO1xuaW1wb3J0IHtcbiAgaW5zdGFudGlhdGVEZWZhdWx0TG9nZ2VyLFxuICBpbnN0YW50aWF0ZU5vb3BMb2dnZXIsXG4gIGxvZ0ZvckZ1bmN0aW9uXG59IGZyb20gXCIuL2xvZ2dpbmcuanNcIjtcbmV4cG9ydCBjb25zdCBTVEFUVVNfQ09ERV9PSyA9IDIwMDtcbmV4cG9ydCBjb25zdCBTVEFUVVNfQ09ERV9CQURfUkVRVUVTVCA9IDQwMDtcbmV4cG9ydCBjb25zdCBTVEFUVVNfQ09ERV9VREZfRkFJTEVEID0gNTYwO1xubGV0IHNwZWNpZmllZEZldGNoID0gdm9pZCAwO1xuZXhwb3J0IGZ1bmN0aW9uIHNldEZldGNoKGYpIHtcbiAgc3BlY2lmaWVkRmV0Y2ggPSBmO1xufVxuZXhwb3J0IGNsYXNzIENvbnZleEh0dHBDbGllbnQge1xuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHtAbGluayBDb252ZXhIdHRwQ2xpZW50fS5cbiAgICpcbiAgICogQHBhcmFtIGFkZHJlc3MgLSBUaGUgdXJsIG9mIHlvdXIgQ29udmV4IGRlcGxveW1lbnQsIG9mdGVuIHByb3ZpZGVkXG4gICAqIGJ5IGFuIGVudmlyb25tZW50IHZhcmlhYmxlLiBFLmcuIGBodHRwczovL3NtYWxsLW1vdXNlLTEyMy5jb252ZXguY2xvdWRgLlxuICAgKiBAcGFyYW0gb3B0aW9ucyAtIEFuIG9iamVjdCBvZiBvcHRpb25zLlxuICAgKiAtIGBza2lwQ29udmV4RGVwbG95bWVudFVybENoZWNrYCAtIFNraXAgdmFsaWRhdGluZyB0aGF0IHRoZSBDb252ZXggZGVwbG95bWVudCBVUkwgbG9va3MgbGlrZVxuICAgKiBgaHR0cHM6Ly9oYXBweS1hbmltYWwtMTIzLmNvbnZleC5jbG91ZGAgb3IgbG9jYWxob3N0LiBUaGlzIGNhbiBiZSB1c2VmdWwgaWYgcnVubmluZyBhIHNlbGYtaG9zdGVkXG4gICAqIENvbnZleCBiYWNrZW5kIHRoYXQgdXNlcyBhIGRpZmZlcmVudCBVUkwuXG4gICAqIC0gYGxvZ2dlcmAgLSBBIGxvZ2dlciBvciBhIGJvb2xlYW4uIElmIG5vdCBwcm92aWRlZCwgbG9ncyB0byB0aGUgY29uc29sZS5cbiAgICogWW91IGNhbiBjb25zdHJ1Y3QgeW91ciBvd24gbG9nZ2VyIHRvIGN1c3RvbWl6ZSBsb2dnaW5nIHRvIGxvZyBlbHNld2hlcmVcbiAgICogb3Igbm90IGxvZyBhdCBhbGwsIG9yIHVzZSBgZmFsc2VgIGFzIGEgc2hvcnRoYW5kIGZvciBhIG5vLW9wIGxvZ2dlci5cbiAgICogQSBsb2dnZXIgaXMgYW4gb2JqZWN0IHdpdGggNCBtZXRob2RzOiBsb2coKSwgd2FybigpLCBlcnJvcigpLCBhbmQgbG9nVmVyYm9zZSgpLlxuICAgKiBUaGVzZSBtZXRob2RzIGNhbiByZWNlaXZlIG11bHRpcGxlIGFyZ3VtZW50cyBvZiBhbnkgdHlwZXMsIGxpa2UgY29uc29sZS5sb2coKS5cbiAgICogLSBgYXV0aGAgLSBBIEpXVCBjb250YWluaW5nIGlkZW50aXR5IGNsYWltcyBhY2Nlc3NpYmxlIGluIENvbnZleCBmdW5jdGlvbnMuXG4gICAqIFRoaXMgaWRlbnRpdHkgbWF5IGV4cGlyZSBzbyBpdCBtYXkgYmUgbmVjZXNzYXJ5IHRvIGNhbGwgYHNldEF1dGgoKWAgbGF0ZXIsXG4gICAqIGJ1dCBmb3Igc2hvcnQtbGl2ZWQgY2xpZW50cyBpdCdzIGNvbnZlbmllbnQgdG8gc3BlY2lmeSB0aGlzIHZhbHVlIGhlcmUuXG4gICAqIC0gYGZldGNoYCAtIEEgY3VzdG9tIGZldGNoIGltcGxlbWVudGF0aW9uIHRvIHVzZSBmb3IgYWxsIEhUVFAgcmVxdWVzdHMgbWFkZSBieSB0aGlzIGNsaWVudC5cbiAgICovXG4gIGNvbnN0cnVjdG9yKGFkZHJlc3MsIG9wdGlvbnMpIHtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwiYWRkcmVzc1wiKTtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwiYXV0aFwiKTtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwiYWRtaW5BdXRoXCIpO1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJlbmNvZGVkVHNQcm9taXNlXCIpO1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJkZWJ1Z1wiKTtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwiZmV0Y2hPcHRpb25zXCIpO1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJmZXRjaFwiKTtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwibG9nZ2VyXCIpO1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJtdXRhdGlvblF1ZXVlXCIsIFtdKTtcbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwiaXNQcm9jZXNzaW5nUXVldWVcIiwgZmFsc2UpO1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJib29sZWFuXCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJza2lwQ29udmV4RGVwbG95bWVudFVybENoZWNrIGFzIHRoZSBzZWNvbmQgYXJndW1lbnQgaXMgbm8gbG9uZ2VyIHN1cHBvcnRlZC4gUGxlYXNlIHBhc3MgYW4gb3B0aW9ucyBvYmplY3QsIGB7IHNraXBDb252ZXhEZXBsb3ltZW50VXJsQ2hlY2s6IHRydWUgfWAuXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IG9wdHMgPSBvcHRpb25zID8/IHt9O1xuICAgIGlmIChvcHRzLnNraXBDb252ZXhEZXBsb3ltZW50VXJsQ2hlY2sgIT09IHRydWUpIHtcbiAgICAgIHZhbGlkYXRlRGVwbG95bWVudFVybChhZGRyZXNzKTtcbiAgICB9XG4gICAgdGhpcy5sb2dnZXIgPSBvcHRpb25zPy5sb2dnZXIgPT09IGZhbHNlID8gaW5zdGFudGlhdGVOb29wTG9nZ2VyKHsgdmVyYm9zZTogZmFsc2UgfSkgOiBvcHRpb25zPy5sb2dnZXIgIT09IHRydWUgJiYgb3B0aW9ucz8ubG9nZ2VyID8gb3B0aW9ucy5sb2dnZXIgOiBpbnN0YW50aWF0ZURlZmF1bHRMb2dnZXIoeyB2ZXJib3NlOiBmYWxzZSB9KTtcbiAgICB0aGlzLmFkZHJlc3MgPSBhZGRyZXNzO1xuICAgIHRoaXMuZGVidWcgPSB0cnVlO1xuICAgIHRoaXMuYXV0aCA9IHZvaWQgMDtcbiAgICB0aGlzLmFkbWluQXV0aCA9IHZvaWQgMDtcbiAgICB0aGlzLmZldGNoID0gb3B0aW9ucz8uZmV0Y2g7XG4gICAgaWYgKG9wdGlvbnM/LmF1dGgpIHtcbiAgICAgIHRoaXMuc2V0QXV0aChvcHRpb25zLmF1dGgpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogT2J0YWluIHRoZSB7QGxpbmsgQ29udmV4SHR0cENsaWVudH0ncyBVUkwgdG8gaXRzIGJhY2tlbmQuXG4gICAqIEBkZXByZWNhdGVkIFVzZSB1cmwsIHdoaWNoIHJldHVybnMgdGhlIHVybCB3aXRob3V0IC9hcGkgYXQgdGhlIGVuZC5cbiAgICpcbiAgICogQHJldHVybnMgVGhlIFVSTCB0byB0aGUgQ29udmV4IGJhY2tlbmQsIGluY2x1ZGluZyB0aGUgY2xpZW50J3MgQVBJIHZlcnNpb24uXG4gICAqL1xuICBiYWNrZW5kVXJsKCkge1xuICAgIHJldHVybiBgJHt0aGlzLmFkZHJlc3N9L2FwaWA7XG4gIH1cbiAgLyoqXG4gICAqIFJldHVybiB0aGUgYWRkcmVzcyBmb3IgdGhpcyBjbGllbnQsIHVzZWZ1bCBmb3IgY3JlYXRpbmcgYSBuZXcgY2xpZW50LlxuICAgKlxuICAgKiBOb3QgZ3VhcmFudGVlZCB0byBtYXRjaCB0aGUgYWRkcmVzcyB3aXRoIHdoaWNoIHRoaXMgY2xpZW50IHdhcyBjb25zdHJ1Y3RlZDpcbiAgICogaXQgbWF5IGJlIGNhbm9uaWNhbGl6ZWQuXG4gICAqL1xuICBnZXQgdXJsKCkge1xuICAgIHJldHVybiB0aGlzLmFkZHJlc3M7XG4gIH1cbiAgLyoqXG4gICAqIFNldCB0aGUgYXV0aGVudGljYXRpb24gdG9rZW4gdG8gYmUgdXNlZCBmb3Igc3Vic2VxdWVudCBxdWVyaWVzIGFuZCBtdXRhdGlvbnMuXG4gICAqXG4gICAqIFNob3VsZCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHRva2VuIGNoYW5nZXMgKGkuZS4gZHVlIHRvIGV4cGlyYXRpb24gYW5kIHJlZnJlc2gpLlxuICAgKlxuICAgKiBAcGFyYW0gdmFsdWUgLSBKV1QtZW5jb2RlZCBPcGVuSUQgQ29ubmVjdCBpZGVudGl0eSB0b2tlbi5cbiAgICovXG4gIHNldEF1dGgodmFsdWUpIHtcbiAgICB0aGlzLmNsZWFyQXV0aCgpO1xuICAgIHRoaXMuYXV0aCA9IHZhbHVlO1xuICB9XG4gIC8qKlxuICAgKiBTZXQgYWRtaW4gYXV0aCB0b2tlbiB0byBhbGxvdyBjYWxsaW5nIGludGVybmFsIHF1ZXJpZXMsIG11dGF0aW9ucywgYW5kIGFjdGlvbnNcbiAgICogYW5kIGFjdGluZyBhcyBhbiBpZGVudGl0eS5cbiAgICpcbiAgICogQGludGVybmFsXG4gICAqL1xuICBzZXRBZG1pbkF1dGgodG9rZW4sIGFjdGluZ0FzSWRlbnRpdHkpIHtcbiAgICB0aGlzLmNsZWFyQXV0aCgpO1xuICAgIGlmIChhY3RpbmdBc0lkZW50aXR5ICE9PSB2b2lkIDApIHtcbiAgICAgIGNvbnN0IGJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKEpTT04uc3RyaW5naWZ5KGFjdGluZ0FzSWRlbnRpdHkpKTtcbiAgICAgIGNvbnN0IGFjdGluZ0FzSWRlbnRpdHlFbmNvZGVkID0gYnRvYShTdHJpbmcuZnJvbUNvZGVQb2ludCguLi5ieXRlcykpO1xuICAgICAgdGhpcy5hZG1pbkF1dGggPSBgJHt0b2tlbn06JHthY3RpbmdBc0lkZW50aXR5RW5jb2RlZH1gO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFkbWluQXV0aCA9IHRva2VuO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogQ2xlYXIgdGhlIGN1cnJlbnQgYXV0aGVudGljYXRpb24gdG9rZW4gaWYgc2V0LlxuICAgKi9cbiAgY2xlYXJBdXRoKCkge1xuICAgIHRoaXMuYXV0aCA9IHZvaWQgMDtcbiAgICB0aGlzLmFkbWluQXV0aCA9IHZvaWQgMDtcbiAgfVxuICAvKipcbiAgICogU2V0cyB3aGV0aGVyIHRoZSByZXN1bHQgbG9nIGxpbmVzIHNob3VsZCBiZSBwcmludGVkIG9uIHRoZSBjb25zb2xlIG9yIG5vdC5cbiAgICpcbiAgICogQGludGVybmFsXG4gICAqL1xuICBzZXREZWJ1ZyhkZWJ1Zykge1xuICAgIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgfVxuICAvKipcbiAgICogVXNlZCB0byBjdXN0b21pemUgdGhlIGZldGNoIGJlaGF2aW9yIGluIHNvbWUgcnVudGltZXMuXG4gICAqXG4gICAqIEBpbnRlcm5hbFxuICAgKi9cbiAgc2V0RmV0Y2hPcHRpb25zKGZldGNoT3B0aW9ucykge1xuICAgIHRoaXMuZmV0Y2hPcHRpb25zID0gZmV0Y2hPcHRpb25zO1xuICB9XG4gIC8qKlxuICAgKiBUaGlzIEFQSSBpcyBleHBlcmltZW50YWw6IGl0IG1heSBjaGFuZ2Ugb3IgZGlzYXBwZWFyLlxuICAgKlxuICAgKiBFeGVjdXRlIGEgQ29udmV4IHF1ZXJ5IGZ1bmN0aW9uIGF0IHRoZSBzYW1lIHRpbWVzdGFtcCBhcyBldmVyeSBvdGhlclxuICAgKiBjb25zaXN0ZW50IHF1ZXJ5IGV4ZWN1dGlvbiBydW4gYnkgdGhpcyBIVFRQIGNsaWVudC5cbiAgICpcbiAgICogVGhpcyBkb2Vzbid0IG1ha2Ugc2Vuc2UgZm9yIGxvbmctbGl2ZWQgQ29udmV4SHR0cENsaWVudHMgYXMgQ29udmV4XG4gICAqIGJhY2tlbmRzIGNhbiByZWFkIGEgbGltaXRlZCBhbW91bnQgaW50byB0aGUgcGFzdDogYmV5b25kIDMwIHNlY29uZHNcbiAgICogaW4gdGhlIHBhc3QgbWF5IG5vdCBiZSBhdmFpbGFibGUuXG4gICAqXG4gICAqIENyZWF0ZSBhIG5ldyBjbGllbnQgdG8gdXNlIGEgY29uc2lzdGVudCB0aW1lLlxuICAgKlxuICAgKiBAcGFyYW0gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBxdWVyeS5cbiAgICogQHBhcmFtIGFyZ3MgLSBUaGUgYXJndW1lbnRzIG9iamVjdCBmb3IgdGhlIHF1ZXJ5LiBJZiB0aGlzIGlzIG9taXR0ZWQsXG4gICAqIHRoZSBhcmd1bWVudHMgd2lsbCBiZSBge31gLlxuICAgKiBAcmV0dXJucyBBIHByb21pc2Ugb2YgdGhlIHF1ZXJ5J3MgcmVzdWx0LlxuICAgKlxuICAgKiBAZGVwcmVjYXRlZCBUaGlzIEFQSSBpcyBleHBlcmltZW50YWw6IGl0IG1heSBjaGFuZ2Ugb3IgZGlzYXBwZWFyLlxuICAgKi9cbiAgYXN5bmMgY29uc2lzdGVudFF1ZXJ5KHF1ZXJ5LCAuLi5hcmdzKSB7XG4gICAgY29uc3QgcXVlcnlBcmdzID0gcGFyc2VBcmdzKGFyZ3NbMF0pO1xuICAgIGNvbnN0IHRpbWVzdGFtcFByb21pc2UgPSB0aGlzLmdldFRpbWVzdGFtcCgpO1xuICAgIHJldHVybiBhd2FpdCB0aGlzLnF1ZXJ5SW5uZXIocXVlcnksIHF1ZXJ5QXJncywgeyB0aW1lc3RhbXBQcm9taXNlIH0pO1xuICB9XG4gIGFzeW5jIGdldFRpbWVzdGFtcCgpIHtcbiAgICBpZiAodGhpcy5lbmNvZGVkVHNQcm9taXNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5lbmNvZGVkVHNQcm9taXNlO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5lbmNvZGVkVHNQcm9taXNlID0gdGhpcy5nZXRUaW1lc3RhbXBJbm5lcigpO1xuICB9XG4gIGFzeW5jIGdldFRpbWVzdGFtcElubmVyKCkge1xuICAgIGNvbnN0IGxvY2FsRmV0Y2ggPSB0aGlzLmZldGNoIHx8IHNwZWNpZmllZEZldGNoIHx8IGZldGNoO1xuICAgIGNvbnN0IGhlYWRlcnMgPSB7XG4gICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgIFwiQ29udmV4LUNsaWVudFwiOiBgbnBtLSR7dmVyc2lvbn1gXG4gICAgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2FsRmV0Y2goYCR7dGhpcy5hZGRyZXNzfS9hcGkvcXVlcnlfdHNgLCB7XG4gICAgICAuLi50aGlzLmZldGNoT3B0aW9ucyxcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBoZWFkZXJzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGF3YWl0IHJlc3BvbnNlLnRleHQoKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgdHMgfSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICByZXR1cm4gdHM7XG4gIH1cbiAgLyoqXG4gICAqIEV4ZWN1dGUgYSBDb252ZXggcXVlcnkgZnVuY3Rpb24uXG4gICAqXG4gICAqIEBwYXJhbSBuYW1lIC0gVGhlIG5hbWUgb2YgdGhlIHF1ZXJ5LlxuICAgKiBAcGFyYW0gYXJncyAtIFRoZSBhcmd1bWVudHMgb2JqZWN0IGZvciB0aGUgcXVlcnkuIElmIHRoaXMgaXMgb21pdHRlZCxcbiAgICogdGhlIGFyZ3VtZW50cyB3aWxsIGJlIGB7fWAuXG4gICAqIEByZXR1cm5zIEEgcHJvbWlzZSBvZiB0aGUgcXVlcnkncyByZXN1bHQuXG4gICAqL1xuICBhc3luYyBxdWVyeShxdWVyeSwgLi4uYXJncykge1xuICAgIGNvbnN0IHF1ZXJ5QXJncyA9IHBhcnNlQXJncyhhcmdzWzBdKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5xdWVyeUlubmVyKHF1ZXJ5LCBxdWVyeUFyZ3MsIHt9KTtcbiAgfVxuICBhc3luYyBxdWVyeUlubmVyKHF1ZXJ5LCBxdWVyeUFyZ3MsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBuYW1lID0gZ2V0RnVuY3Rpb25OYW1lKHF1ZXJ5KTtcbiAgICBjb25zdCBhcmdzID0gW2NvbnZleFRvSnNvbihxdWVyeUFyZ3MpXTtcbiAgICBjb25zdCBoZWFkZXJzID0ge1xuICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICBcIkNvbnZleC1DbGllbnRcIjogYG5wbS0ke3ZlcnNpb259YFxuICAgIH07XG4gICAgaWYgKHRoaXMuYWRtaW5BdXRoKSB7XG4gICAgICBoZWFkZXJzW1wiQXV0aG9yaXphdGlvblwiXSA9IGBDb252ZXggJHt0aGlzLmFkbWluQXV0aH1gO1xuICAgIH0gZWxzZSBpZiAodGhpcy5hdXRoKSB7XG4gICAgICBoZWFkZXJzW1wiQXV0aG9yaXphdGlvblwiXSA9IGBCZWFyZXIgJHt0aGlzLmF1dGh9YDtcbiAgICB9XG4gICAgY29uc3QgbG9jYWxGZXRjaCA9IHRoaXMuZmV0Y2ggfHwgc3BlY2lmaWVkRmV0Y2ggfHwgZmV0Y2g7XG4gICAgY29uc3QgdGltZXN0YW1wID0gb3B0aW9ucy50aW1lc3RhbXBQcm9taXNlID8gYXdhaXQgb3B0aW9ucy50aW1lc3RhbXBQcm9taXNlIDogdm9pZCAwO1xuICAgIGNvbnN0IGJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBwYXRoOiBuYW1lLFxuICAgICAgZm9ybWF0OiBcImNvbnZleF9lbmNvZGVkX2pzb25cIixcbiAgICAgIGFyZ3MsXG4gICAgICAuLi50aW1lc3RhbXAgPyB7IHRzOiB0aW1lc3RhbXAgfSA6IHt9XG4gICAgfSk7XG4gICAgY29uc3QgZW5kcG9pbnQgPSB0aW1lc3RhbXAgPyBgJHt0aGlzLmFkZHJlc3N9L2FwaS9xdWVyeV9hdF90c2AgOiBgJHt0aGlzLmFkZHJlc3N9L2FwaS9xdWVyeWA7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBsb2NhbEZldGNoKGVuZHBvaW50LCB7XG4gICAgICAuLi50aGlzLmZldGNoT3B0aW9ucyxcbiAgICAgIGJvZHksXG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgaGVhZGVyc1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2Uuc3RhdHVzICE9PSBTVEFUVVNfQ09ERV9VREZfRkFJTEVEKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYXdhaXQgcmVzcG9uc2UudGV4dCgpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzcEpTT04gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgaWYgKHRoaXMuZGVidWcpIHtcbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiByZXNwSlNPTi5sb2dMaW5lcyA/PyBbXSkge1xuICAgICAgICBsb2dGb3JGdW5jdGlvbih0aGlzLmxvZ2dlciwgXCJpbmZvXCIsIFwicXVlcnlcIiwgbmFtZSwgbGluZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHN3aXRjaCAocmVzcEpTT04uc3RhdHVzKSB7XG4gICAgICBjYXNlIFwic3VjY2Vzc1wiOlxuICAgICAgICByZXR1cm4ganNvblRvQ29udmV4KHJlc3BKU09OLnZhbHVlKTtcbiAgICAgIGNhc2UgXCJlcnJvclwiOlxuICAgICAgICBpZiAocmVzcEpTT04uZXJyb3JEYXRhICE9PSB2b2lkIDApIHtcbiAgICAgICAgICB0aHJvdyBmb3J3YXJkRXJyb3JEYXRhKFxuICAgICAgICAgICAgcmVzcEpTT04uZXJyb3JEYXRhLFxuICAgICAgICAgICAgbmV3IENvbnZleEVycm9yKHJlc3BKU09OLmVycm9yTWVzc2FnZSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihyZXNwSlNPTi5lcnJvck1lc3NhZ2UpO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHJlc3BvbnNlOiAke0pTT04uc3RyaW5naWZ5KHJlc3BKU09OKX1gKTtcbiAgICB9XG4gIH1cbiAgYXN5bmMgbXV0YXRpb25Jbm5lcihtdXRhdGlvbiwgbXV0YXRpb25BcmdzKSB7XG4gICAgY29uc3QgbmFtZSA9IGdldEZ1bmN0aW9uTmFtZShtdXRhdGlvbik7XG4gICAgY29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIHBhdGg6IG5hbWUsXG4gICAgICBmb3JtYXQ6IFwiY29udmV4X2VuY29kZWRfanNvblwiLFxuICAgICAgYXJnczogW2NvbnZleFRvSnNvbihtdXRhdGlvbkFyZ3MpXVxuICAgIH0pO1xuICAgIGNvbnN0IGhlYWRlcnMgPSB7XG4gICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgIFwiQ29udmV4LUNsaWVudFwiOiBgbnBtLSR7dmVyc2lvbn1gXG4gICAgfTtcbiAgICBpZiAodGhpcy5hZG1pbkF1dGgpIHtcbiAgICAgIGhlYWRlcnNbXCJBdXRob3JpemF0aW9uXCJdID0gYENvbnZleCAke3RoaXMuYWRtaW5BdXRofWA7XG4gICAgfSBlbHNlIGlmICh0aGlzLmF1dGgpIHtcbiAgICAgIGhlYWRlcnNbXCJBdXRob3JpemF0aW9uXCJdID0gYEJlYXJlciAke3RoaXMuYXV0aH1gO1xuICAgIH1cbiAgICBjb25zdCBsb2NhbEZldGNoID0gdGhpcy5mZXRjaCB8fCBzcGVjaWZpZWRGZXRjaCB8fCBmZXRjaDtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2FsRmV0Y2goYCR7dGhpcy5hZGRyZXNzfS9hcGkvbXV0YXRpb25gLCB7XG4gICAgICAuLi50aGlzLmZldGNoT3B0aW9ucyxcbiAgICAgIGJvZHksXG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgaGVhZGVyc1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2Uuc3RhdHVzICE9PSBTVEFUVVNfQ09ERV9VREZfRkFJTEVEKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYXdhaXQgcmVzcG9uc2UudGV4dCgpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzcEpTT04gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgaWYgKHRoaXMuZGVidWcpIHtcbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiByZXNwSlNPTi5sb2dMaW5lcyA/PyBbXSkge1xuICAgICAgICBsb2dGb3JGdW5jdGlvbih0aGlzLmxvZ2dlciwgXCJpbmZvXCIsIFwibXV0YXRpb25cIiwgbmFtZSwgbGluZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHN3aXRjaCAocmVzcEpTT04uc3RhdHVzKSB7XG4gICAgICBjYXNlIFwic3VjY2Vzc1wiOlxuICAgICAgICByZXR1cm4ganNvblRvQ29udmV4KHJlc3BKU09OLnZhbHVlKTtcbiAgICAgIGNhc2UgXCJlcnJvclwiOlxuICAgICAgICBpZiAocmVzcEpTT04uZXJyb3JEYXRhICE9PSB2b2lkIDApIHtcbiAgICAgICAgICB0aHJvdyBmb3J3YXJkRXJyb3JEYXRhKFxuICAgICAgICAgICAgcmVzcEpTT04uZXJyb3JEYXRhLFxuICAgICAgICAgICAgbmV3IENvbnZleEVycm9yKHJlc3BKU09OLmVycm9yTWVzc2FnZSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihyZXNwSlNPTi5lcnJvck1lc3NhZ2UpO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHJlc3BvbnNlOiAke0pTT04uc3RyaW5naWZ5KHJlc3BKU09OKX1gKTtcbiAgICB9XG4gIH1cbiAgYXN5bmMgcHJvY2Vzc011dGF0aW9uUXVldWUoKSB7XG4gICAgaWYgKHRoaXMuaXNQcm9jZXNzaW5nUXVldWUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5pc1Byb2Nlc3NpbmdRdWV1ZSA9IHRydWU7XG4gICAgd2hpbGUgKHRoaXMubXV0YXRpb25RdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB7IG11dGF0aW9uLCBhcmdzLCByZXNvbHZlLCByZWplY3QgfSA9IHRoaXMubXV0YXRpb25RdWV1ZS5zaGlmdCgpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tdXRhdGlvbklubmVyKG11dGF0aW9uLCBhcmdzKTtcbiAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5pc1Byb2Nlc3NpbmdRdWV1ZSA9IGZhbHNlO1xuICB9XG4gIGVucXVldWVNdXRhdGlvbihtdXRhdGlvbiwgYXJncykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICB0aGlzLm11dGF0aW9uUXVldWUucHVzaCh7IG11dGF0aW9uLCBhcmdzLCByZXNvbHZlLCByZWplY3QgfSk7XG4gICAgICB2b2lkIHRoaXMucHJvY2Vzc011dGF0aW9uUXVldWUoKTtcbiAgICB9KTtcbiAgfVxuICAvKipcbiAgICogRXhlY3V0ZSBhIENvbnZleCBtdXRhdGlvbiBmdW5jdGlvbi4gTXV0YXRpb25zIGFyZSBxdWV1ZWQgYnkgZGVmYXVsdC5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgbXV0YXRpb24uXG4gICAqIEBwYXJhbSBhcmdzIC0gVGhlIGFyZ3VtZW50cyBvYmplY3QgZm9yIHRoZSBtdXRhdGlvbi4gSWYgdGhpcyBpcyBvbWl0dGVkLFxuICAgKiB0aGUgYXJndW1lbnRzIHdpbGwgYmUgYHt9YC5cbiAgICogQHBhcmFtIG9wdGlvbnMgLSBBbiBvcHRpb25hbCBvYmplY3QgY29udGFpbmluZ1xuICAgKiBAcmV0dXJucyBBIHByb21pc2Ugb2YgdGhlIG11dGF0aW9uJ3MgcmVzdWx0LlxuICAgKi9cbiAgYXN5bmMgbXV0YXRpb24obXV0YXRpb24sIC4uLmFyZ3MpIHtcbiAgICBjb25zdCBbZm5BcmdzLCBvcHRpb25zXSA9IGFyZ3M7XG4gICAgY29uc3QgbXV0YXRpb25BcmdzID0gcGFyc2VBcmdzKGZuQXJncyk7XG4gICAgY29uc3QgcXVldWVkID0gIW9wdGlvbnM/LnNraXBRdWV1ZTtcbiAgICBpZiAocXVldWVkKSB7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5lbnF1ZXVlTXV0YXRpb24obXV0YXRpb24sIG11dGF0aW9uQXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLm11dGF0aW9uSW5uZXIobXV0YXRpb24sIG11dGF0aW9uQXJncyk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiBFeGVjdXRlIGEgQ29udmV4IGFjdGlvbiBmdW5jdGlvbi4gQWN0aW9ucyBhcmUgbm90IHF1ZXVlZC5cbiAgICpcbiAgICogQHBhcmFtIG5hbWUgLSBUaGUgbmFtZSBvZiB0aGUgYWN0aW9uLlxuICAgKiBAcGFyYW0gYXJncyAtIFRoZSBhcmd1bWVudHMgb2JqZWN0IGZvciB0aGUgYWN0aW9uLiBJZiB0aGlzIGlzIG9taXR0ZWQsXG4gICAqIHRoZSBhcmd1bWVudHMgd2lsbCBiZSBge31gLlxuICAgKiBAcmV0dXJucyBBIHByb21pc2Ugb2YgdGhlIGFjdGlvbidzIHJlc3VsdC5cbiAgICovXG4gIGFzeW5jIGFjdGlvbihhY3Rpb24sIC4uLmFyZ3MpIHtcbiAgICBjb25zdCBhY3Rpb25BcmdzID0gcGFyc2VBcmdzKGFyZ3NbMF0pO1xuICAgIGNvbnN0IG5hbWUgPSBnZXRGdW5jdGlvbk5hbWUoYWN0aW9uKTtcbiAgICBjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgcGF0aDogbmFtZSxcbiAgICAgIGZvcm1hdDogXCJjb252ZXhfZW5jb2RlZF9qc29uXCIsXG4gICAgICBhcmdzOiBbY29udmV4VG9Kc29uKGFjdGlvbkFyZ3MpXVxuICAgIH0pO1xuICAgIGNvbnN0IGhlYWRlcnMgPSB7XG4gICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgIFwiQ29udmV4LUNsaWVudFwiOiBgbnBtLSR7dmVyc2lvbn1gXG4gICAgfTtcbiAgICBpZiAodGhpcy5hZG1pbkF1dGgpIHtcbiAgICAgIGhlYWRlcnNbXCJBdXRob3JpemF0aW9uXCJdID0gYENvbnZleCAke3RoaXMuYWRtaW5BdXRofWA7XG4gICAgfSBlbHNlIGlmICh0aGlzLmF1dGgpIHtcbiAgICAgIGhlYWRlcnNbXCJBdXRob3JpemF0aW9uXCJdID0gYEJlYXJlciAke3RoaXMuYXV0aH1gO1xuICAgIH1cbiAgICBjb25zdCBsb2NhbEZldGNoID0gdGhpcy5mZXRjaCB8fCBzcGVjaWZpZWRGZXRjaCB8fCBmZXRjaDtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2FsRmV0Y2goYCR7dGhpcy5hZGRyZXNzfS9hcGkvYWN0aW9uYCwge1xuICAgICAgLi4udGhpcy5mZXRjaE9wdGlvbnMsXG4gICAgICBib2R5LFxuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLnN0YXR1cyAhPT0gU1RBVFVTX0NPREVfVURGX0ZBSUxFRCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGF3YWl0IHJlc3BvbnNlLnRleHQoKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BKU09OID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgcmVzcEpTT04ubG9nTGluZXMgPz8gW10pIHtcbiAgICAgICAgbG9nRm9yRnVuY3Rpb24odGhpcy5sb2dnZXIsIFwiaW5mb1wiLCBcImFjdGlvblwiLCBuYW1lLCBsaW5lKTtcbiAgICAgIH1cbiAgICB9XG4gICAgc3dpdGNoIChyZXNwSlNPTi5zdGF0dXMpIHtcbiAgICAgIGNhc2UgXCJzdWNjZXNzXCI6XG4gICAgICAgIHJldHVybiBqc29uVG9Db252ZXgocmVzcEpTT04udmFsdWUpO1xuICAgICAgY2FzZSBcImVycm9yXCI6XG4gICAgICAgIGlmIChyZXNwSlNPTi5lcnJvckRhdGEgIT09IHZvaWQgMCkge1xuICAgICAgICAgIHRocm93IGZvcndhcmRFcnJvckRhdGEoXG4gICAgICAgICAgICByZXNwSlNPTi5lcnJvckRhdGEsXG4gICAgICAgICAgICBuZXcgQ29udmV4RXJyb3IocmVzcEpTT04uZXJyb3JNZXNzYWdlKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHJlc3BKU09OLmVycm9yTWVzc2FnZSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgcmVzcG9uc2U6ICR7SlNPTi5zdHJpbmdpZnkocmVzcEpTT04pfWApO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogRXhlY3V0ZSBhIENvbnZleCBmdW5jdGlvbiBvZiBhbiB1bmtub3duIHR5cGUuIFRoZXNlIGZ1bmN0aW9uIGNhbGxzIGFyZSBub3QgcXVldWVkLlxuICAgKlxuICAgKiBAcGFyYW0gbmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBmdW5jdGlvbi5cbiAgICogQHBhcmFtIGFyZ3MgLSBUaGUgYXJndW1lbnRzIG9iamVjdCBmb3IgdGhlIGZ1bmN0aW9uLiBJZiB0aGlzIGlzIG9taXR0ZWQsXG4gICAqIHRoZSBhcmd1bWVudHMgd2lsbCBiZSBge31gLlxuICAgKiBAcmV0dXJucyBBIHByb21pc2Ugb2YgdGhlIGZ1bmN0aW9uJ3MgcmVzdWx0LlxuICAgKlxuICAgKiBAaW50ZXJuYWxcbiAgICovXG4gIGFzeW5jIGZ1bmN0aW9uKGFueUZ1bmN0aW9uLCBjb21wb25lbnRQYXRoLCAuLi5hcmdzKSB7XG4gICAgY29uc3QgZnVuY3Rpb25BcmdzID0gcGFyc2VBcmdzKGFyZ3NbMF0pO1xuICAgIGNvbnN0IG5hbWUgPSB0eXBlb2YgYW55RnVuY3Rpb24gPT09IFwic3RyaW5nXCIgPyBhbnlGdW5jdGlvbiA6IGdldEZ1bmN0aW9uTmFtZShhbnlGdW5jdGlvbik7XG4gICAgY29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGNvbXBvbmVudFBhdGgsXG4gICAgICBwYXRoOiBuYW1lLFxuICAgICAgZm9ybWF0OiBcImNvbnZleF9lbmNvZGVkX2pzb25cIixcbiAgICAgIGFyZ3M6IGNvbnZleFRvSnNvbihmdW5jdGlvbkFyZ3MpXG4gICAgfSk7XG4gICAgY29uc3QgaGVhZGVycyA9IHtcbiAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgXCJDb252ZXgtQ2xpZW50XCI6IGBucG0tJHt2ZXJzaW9ufWBcbiAgICB9O1xuICAgIGlmICh0aGlzLmFkbWluQXV0aCkge1xuICAgICAgaGVhZGVyc1tcIkF1dGhvcml6YXRpb25cIl0gPSBgQ29udmV4ICR7dGhpcy5hZG1pbkF1dGh9YDtcbiAgICB9IGVsc2UgaWYgKHRoaXMuYXV0aCkge1xuICAgICAgaGVhZGVyc1tcIkF1dGhvcml6YXRpb25cIl0gPSBgQmVhcmVyICR7dGhpcy5hdXRofWA7XG4gICAgfVxuICAgIGNvbnN0IGxvY2FsRmV0Y2ggPSB0aGlzLmZldGNoIHx8IHNwZWNpZmllZEZldGNoIHx8IGZldGNoO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbG9jYWxGZXRjaChgJHt0aGlzLmFkZHJlc3N9L2FwaS9mdW5jdGlvbmAsIHtcbiAgICAgIC4uLnRoaXMuZmV0Y2hPcHRpb25zLFxuICAgICAgYm9keSxcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBoZWFkZXJzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5vayAmJiByZXNwb25zZS5zdGF0dXMgIT09IFNUQVRVU19DT0RFX1VERl9GQUlMRUQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihhd2FpdCByZXNwb25zZS50ZXh0KCkpO1xuICAgIH1cbiAgICBjb25zdCByZXNwSlNPTiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICBpZiAodGhpcy5kZWJ1Zykge1xuICAgICAgZm9yIChjb25zdCBsaW5lIG9mIHJlc3BKU09OLmxvZ0xpbmVzID8/IFtdKSB7XG4gICAgICAgIGxvZ0ZvckZ1bmN0aW9uKHRoaXMubG9nZ2VyLCBcImluZm9cIiwgXCJhbnlcIiwgbmFtZSwgbGluZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHN3aXRjaCAocmVzcEpTT04uc3RhdHVzKSB7XG4gICAgICBjYXNlIFwic3VjY2Vzc1wiOlxuICAgICAgICByZXR1cm4ganNvblRvQ29udmV4KHJlc3BKU09OLnZhbHVlKTtcbiAgICAgIGNhc2UgXCJlcnJvclwiOlxuICAgICAgICBpZiAocmVzcEpTT04uZXJyb3JEYXRhICE9PSB2b2lkIDApIHtcbiAgICAgICAgICB0aHJvdyBmb3J3YXJkRXJyb3JEYXRhKFxuICAgICAgICAgICAgcmVzcEpTT04uZXJyb3JEYXRhLFxuICAgICAgICAgICAgbmV3IENvbnZleEVycm9yKHJlc3BKU09OLmVycm9yTWVzc2FnZSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihyZXNwSlNPTi5lcnJvck1lc3NhZ2UpO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHJlc3BvbnNlOiAke0pTT04uc3RyaW5naWZ5KHJlc3BKU09OKX1gKTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIGZvcndhcmRFcnJvckRhdGEoZXJyb3JEYXRhLCBlcnJvcikge1xuICBlcnJvci5kYXRhID0ganNvblRvQ29udmV4KGVycm9yRGF0YSk7XG4gIHJldHVybiBlcnJvcjtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWh0dHBfY2xpZW50LmpzLm1hcFxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgX19kZWZQcm9wID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xudmFyIF9fZGVmTm9ybWFsUHJvcCA9IChvYmosIGtleSwgdmFsdWUpID0+IGtleSBpbiBvYmogPyBfX2RlZlByb3Aob2JqLCBrZXksIHsgZW51bWVyYWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLCB3cml0YWJsZTogdHJ1ZSwgdmFsdWUgfSkgOiBvYmpba2V5XSA9IHZhbHVlO1xudmFyIF9fcHVibGljRmllbGQgPSAob2JqLCBrZXksIHZhbHVlKSA9PiBfX2RlZk5vcm1hbFByb3Aob2JqLCB0eXBlb2Yga2V5ICE9PSBcInN5bWJvbFwiID8ga2V5ICsgXCJcIiA6IGtleSwgdmFsdWUpO1xuaW1wb3J0IHsgY29udmV4VG9Kc29uIH0gZnJvbSBcIi4uLy4uL3ZhbHVlcy9pbmRleC5qc1wiO1xuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gXCIuLi8uLi9pbmRleC5qc1wiO1xuaW1wb3J0IHsgcGVyZm9ybUFzeW5jU3lzY2FsbCB9IGZyb20gXCIuLi9pbXBsL3N5c2NhbGwuanNcIjtcbmltcG9ydCB7XG4gIGdldEZ1bmN0aW9uQWRkcmVzcyxcbiAgc2V0UmVmZXJlbmNlUGF0aCxcbiAgdG9SZWZlcmVuY2VQYXRoXG59IGZyb20gXCIuL3BhdGhzLmpzXCI7XG5leHBvcnQgeyBnZXRGdW5jdGlvbkFkZHJlc3MgfSBmcm9tIFwiLi9wYXRocy5qc1wiO1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUZ1bmN0aW9uSGFuZGxlKGZ1bmN0aW9uUmVmZXJlbmNlKSB7XG4gIGNvbnN0IGFkZHJlc3MgPSBnZXRGdW5jdGlvbkFkZHJlc3MoZnVuY3Rpb25SZWZlcmVuY2UpO1xuICByZXR1cm4gYXdhaXQgcGVyZm9ybUFzeW5jU3lzY2FsbChcIjEuMC9jcmVhdGVGdW5jdGlvbkhhbmRsZVwiLCB7XG4gICAgLi4uYWRkcmVzcyxcbiAgICB2ZXJzaW9uXG4gIH0pO1xufVxuY2xhc3MgSW5zdGFsbGVkQ29tcG9uZW50IHtcbiAgY29uc3RydWN0b3IoZGVmaW5pdGlvbiwgbmFtZSkge1xuICAgIC8qKlxuICAgICAqIEBpbnRlcm5hbFxuICAgICAqL1xuICAgIF9fcHVibGljRmllbGQodGhpcywgXCJfZGVmaW5pdGlvblwiKTtcbiAgICAvKipcbiAgICAgKiBAaW50ZXJuYWxcbiAgICAgKi9cbiAgICBfX3B1YmxpY0ZpZWxkKHRoaXMsIFwiX25hbWVcIik7XG4gICAgdGhpcy5fZGVmaW5pdGlvbiA9IGRlZmluaXRpb247XG4gICAgdGhpcy5fbmFtZSA9IG5hbWU7XG4gICAgc2V0UmVmZXJlbmNlUGF0aCh0aGlzLCBgX3JlZmVyZW5jZS9jaGlsZENvbXBvbmVudC8ke25hbWV9YCk7XG4gIH1cbiAgZ2V0IGV4cG9ydHMoKSB7XG4gICAgcmV0dXJuIGNyZWF0ZUV4cG9ydHModGhpcy5fbmFtZSwgW10pO1xuICB9XG59XG5mdW5jdGlvbiBjcmVhdGVFeHBvcnRzKG5hbWUsIHBhdGhQYXJ0cykge1xuICBjb25zdCBoYW5kbGVyID0ge1xuICAgIGdldChfLCBwcm9wKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3AgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgY29uc3QgbmV3UGFydHMgPSBbLi4ucGF0aFBhcnRzLCBwcm9wXTtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUV4cG9ydHMobmFtZSwgbmV3UGFydHMpO1xuICAgICAgfSBlbHNlIGlmIChwcm9wID09PSB0b1JlZmVyZW5jZVBhdGgpIHtcbiAgICAgICAgbGV0IHJlZmVyZW5jZSA9IGBfcmVmZXJlbmNlL2NoaWxkQ29tcG9uZW50LyR7bmFtZX1gO1xuICAgICAgICBmb3IgKGNvbnN0IHBhcnQgb2YgcGF0aFBhcnRzKSB7XG4gICAgICAgICAgcmVmZXJlbmNlICs9IGAvJHtwYXJ0fWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlZmVyZW5jZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICByZXR1cm4gbmV3IFByb3h5KHt9LCBoYW5kbGVyKTtcbn1cbmZ1bmN0aW9uIHVzZShkZWZpbml0aW9uLCBvcHRpb25zKSB7XG4gIGNvbnN0IGltcG9ydGVkQ29tcG9uZW50RGVmaW5pdGlvbiA9IGRlZmluaXRpb247XG4gIGlmICh0eXBlb2YgaW1wb3J0ZWRDb21wb25lbnREZWZpbml0aW9uLmNvbXBvbmVudERlZmluaXRpb25QYXRoICE9PSBcInN0cmluZ1wiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJDb21wb25lbnQgZGVmaW5pdGlvbiBkb2VzIG5vdCBoYXZlIHRoZSByZXF1aXJlZCBjb21wb25lbnREZWZpbml0aW9uUGF0aCBwcm9wZXJ0eS4gVGhpcyBjb2RlIG9ubHkgd29ya3MgaW4gQ29udmV4IHJ1bnRpbWUuXCJcbiAgICApO1xuICB9XG4gIGNvbnN0IG5hbWUgPSBvcHRpb25zPy5uYW1lID8/IC8vIGFkZGVkIHJlY2VudGx5XG4gIGltcG9ydGVkQ29tcG9uZW50RGVmaW5pdGlvbi5kZWZhdWx0TmFtZSA/PyAvLyBjYW4gYmUgcmVtb3ZlZCBvbmNlIGJhY2tlbmQgaXMgb3V0XG4gIGltcG9ydGVkQ29tcG9uZW50RGVmaW5pdGlvbi5jb21wb25lbnREZWZpbml0aW9uUGF0aC5zcGxpdChcIi9cIikucG9wKCk7XG4gIGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBDb21wb25lbnQgbmFtZSBtdXN0IGJlIGEgc3RyaW5nLiBSZWNlaXZlZDogJHt0eXBlb2YgbmFtZX1gXG4gICAgKTtcbiAgfVxuICBpZiAobmFtZS5sZW5ndGggPT09IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb21wb25lbnQgbmFtZSBjYW5ub3QgYmUgZW1wdHkuXCIpO1xuICB9XG4gIHRoaXMuX2NoaWxkQ29tcG9uZW50cy5wdXNoKFtuYW1lLCBpbXBvcnRlZENvbXBvbmVudERlZmluaXRpb24sIHt9XSk7XG4gIHJldHVybiBuZXcgSW5zdGFsbGVkQ29tcG9uZW50KGRlZmluaXRpb24sIG5hbWUpO1xufVxuZnVuY3Rpb24gZXhwb3J0QXBwRm9yQW5hbHlzaXMoKSB7XG4gIGNvbnN0IGRlZmluaXRpb25UeXBlID0geyB0eXBlOiBcImFwcFwiIH07XG4gIGNvbnN0IGNoaWxkQ29tcG9uZW50cyA9IHNlcmlhbGl6ZUNoaWxkQ29tcG9uZW50cyh0aGlzLl9jaGlsZENvbXBvbmVudHMpO1xuICByZXR1cm4ge1xuICAgIGRlZmluaXRpb25UeXBlLFxuICAgIGNoaWxkQ29tcG9uZW50cyxcbiAgICBodHRwTW91bnRzOiB7fSxcbiAgICBleHBvcnRzOiBzZXJpYWxpemVFeHBvcnRUcmVlKHRoaXMuX2V4cG9ydFRyZWUpXG4gIH07XG59XG5mdW5jdGlvbiBzZXJpYWxpemVFeHBvcnRUcmVlKHRyZWUpIHtcbiAgY29uc3QgYnJhbmNoID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgY2hpbGRdIG9mIE9iamVjdC5lbnRyaWVzKHRyZWUpKSB7XG4gICAgbGV0IG5vZGU7XG4gICAgaWYgKHR5cGVvZiBjaGlsZCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgbm9kZSA9IHsgdHlwZTogXCJsZWFmXCIsIGxlYWY6IGNoaWxkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIG5vZGUgPSBzZXJpYWxpemVFeHBvcnRUcmVlKGNoaWxkKTtcbiAgICB9XG4gICAgYnJhbmNoLnB1c2goW2tleSwgbm9kZV0pO1xuICB9XG4gIHJldHVybiB7IHR5cGU6IFwiYnJhbmNoXCIsIGJyYW5jaCB9O1xufVxuZnVuY3Rpb24gc2VyaWFsaXplQ2hpbGRDb21wb25lbnRzKGNoaWxkQ29tcG9uZW50cykge1xuICByZXR1cm4gY2hpbGRDb21wb25lbnRzLm1hcCgoW25hbWUsIGRlZmluaXRpb24sIHBdKSA9PiB7XG4gICAgbGV0IGFyZ3MgPSBudWxsO1xuICAgIGlmIChwICE9PSBudWxsKSB7XG4gICAgICBhcmdzID0gW107XG4gICAgICBmb3IgKGNvbnN0IFtuYW1lMiwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHApKSB7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgYXJncy5wdXNoKFtcbiAgICAgICAgICAgIG5hbWUyLFxuICAgICAgICAgICAgeyB0eXBlOiBcInZhbHVlXCIsIHZhbHVlOiBKU09OLnN0cmluZ2lmeShjb252ZXhUb0pzb24odmFsdWUpKSB9XG4gICAgICAgICAgXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGRlZmluaXRpb24uY29tcG9uZW50RGVmaW5pdGlvblBhdGg7XG4gICAgaWYgKCFwYXRoKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIm5vIC5jb21wb25lbnRQYXRoIGZvciBjb21wb25lbnQgZGVmaW5pdGlvbiBcIiArIEpTT04uc3RyaW5naWZ5KGRlZmluaXRpb24sIG51bGwsIDIpXG4gICAgICApO1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lLFxuICAgICAgcGF0aCxcbiAgICAgIGFyZ3NcbiAgICB9O1xuICB9KTtcbn1cbmZ1bmN0aW9uIGV4cG9ydENvbXBvbmVudEZvckFuYWx5c2lzKCkge1xuICBjb25zdCBhcmdzID0gT2JqZWN0LmVudHJpZXMoXG4gICAgdGhpcy5fYXJnc1xuICApLm1hcCgoW25hbWUsIHZhbGlkYXRvcl0pID0+IFtcbiAgICBuYW1lLFxuICAgIHtcbiAgICAgIHR5cGU6IFwidmFsdWVcIixcbiAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh2YWxpZGF0b3IuanNvbilcbiAgICB9XG4gIF0pO1xuICBjb25zdCBkZWZpbml0aW9uVHlwZSA9IHtcbiAgICB0eXBlOiBcImNoaWxkQ29tcG9uZW50XCIsXG4gICAgbmFtZTogdGhpcy5fbmFtZSxcbiAgICBhcmdzXG4gIH07XG4gIGNvbnN0IGNoaWxkQ29tcG9uZW50cyA9IHNlcmlhbGl6ZUNoaWxkQ29tcG9uZW50cyh0aGlzLl9jaGlsZENvbXBvbmVudHMpO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IHRoaXMuX25hbWUsXG4gICAgZGVmaW5pdGlvblR5cGUsXG4gICAgY2hpbGRDb21wb25lbnRzLFxuICAgIGh0dHBNb3VudHM6IHt9LFxuICAgIGV4cG9ydHM6IHNlcmlhbGl6ZUV4cG9ydFRyZWUodGhpcy5fZXhwb3J0VHJlZSlcbiAgfTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb21wb25lbnQobmFtZSkge1xuICBjb25zdCByZXQgPSB7XG4gICAgX2lzUm9vdDogZmFsc2UsXG4gICAgX25hbWU6IG5hbWUsXG4gICAgX2FyZ3M6IHt9LFxuICAgIF9jaGlsZENvbXBvbmVudHM6IFtdLFxuICAgIF9leHBvcnRUcmVlOiB7fSxcbiAgICBfb25Jbml0Q2FsbGJhY2tzOiB7fSxcbiAgICBleHBvcnQ6IGV4cG9ydENvbXBvbmVudEZvckFuYWx5c2lzLFxuICAgIHVzZSxcbiAgICAvLyBwcmV0ZW5kIHRvIGNvbmZvcm0gdG8gQ29tcG9uZW50RGVmaW5pdGlvbiwgd2hpY2ggdGVtcG9yYXJpbHkgZXhwZWN0cyBfX2FyZ3NcbiAgICAuLi57fVxuICB9O1xuICByZXR1cm4gcmV0O1xufVxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUFwcCgpIHtcbiAgY29uc3QgcmV0ID0ge1xuICAgIF9pc1Jvb3Q6IHRydWUsXG4gICAgX2NoaWxkQ29tcG9uZW50czogW10sXG4gICAgX2V4cG9ydFRyZWU6IHt9LFxuICAgIGV4cG9ydDogZXhwb3J0QXBwRm9yQW5hbHlzaXMsXG4gICAgdXNlXG4gIH07XG4gIHJldHVybiByZXQ7XG59XG5leHBvcnQgZnVuY3Rpb24gY3VycmVudFN5c3RlbVVkZkluQ29tcG9uZW50KGNvbXBvbmVudElkKSB7XG4gIHJldHVybiB7XG4gICAgW3RvUmVmZXJlbmNlUGF0aF06IGBfcmVmZXJlbmNlL2N1cnJlbnRTeXN0ZW1VZGZJbkNvbXBvbmVudC8ke2NvbXBvbmVudElkfWBcbiAgfTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUNoaWxkQ29tcG9uZW50cyhyb290LCBwYXRoUGFydHMpIHtcbiAgY29uc3QgaGFuZGxlciA9IHtcbiAgICBnZXQoXywgcHJvcCkge1xuICAgICAgaWYgKHR5cGVvZiBwcm9wID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGNvbnN0IG5ld1BhcnRzID0gWy4uLnBhdGhQYXJ0cywgcHJvcF07XG4gICAgICAgIHJldHVybiBjcmVhdGVDaGlsZENvbXBvbmVudHMocm9vdCwgbmV3UGFydHMpO1xuICAgICAgfSBlbHNlIGlmIChwcm9wID09PSB0b1JlZmVyZW5jZVBhdGgpIHtcbiAgICAgICAgaWYgKHBhdGhQYXJ0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgICAgY29uc3QgZm91bmQgPSBbcm9vdCwgLi4ucGF0aFBhcnRzXS5qb2luKFwiLlwiKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgQVBJIHBhdGggaXMgZXhwZWN0ZWQgdG8gYmUgb2YgdGhlIGZvcm0gXFxgJHtyb290fS5jaGlsZENvbXBvbmVudC5mdW5jdGlvbk5hbWVcXGAuIEZvdW5kOiBcXGAke2ZvdW5kfVxcYGBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgX3JlZmVyZW5jZS9jaGlsZENvbXBvbmVudC9gICsgcGF0aFBhcnRzLmpvaW4oXCIvXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIHJldHVybiBuZXcgUHJveHkoe30sIGhhbmRsZXIpO1xufVxuZXhwb3J0IGNvbnN0IGNvbXBvbmVudHNHZW5lcmljID0gKCkgPT4gY3JlYXRlQ2hpbGRDb21wb25lbnRzKFwiY29tcG9uZW50c1wiLCBbXSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXBcbiIsIi8qIGVzbGludC1kaXNhYmxlICovXG4vKipcbiAqIEdlbmVyYXRlZCBgYXBpYCB1dGlsaXR5LlxuICpcbiAqIFRISVMgQ09ERSBJUyBBVVRPTUFUSUNBTExZIEdFTkVSQVRFRC5cbiAqXG4gKiBUbyByZWdlbmVyYXRlLCBydW4gYG5weCBjb252ZXggZGV2YC5cbiAqIEBtb2R1bGVcbiAqL1xuXG5pbXBvcnQgeyBhbnlBcGksIGNvbXBvbmVudHNHZW5lcmljIH0gZnJvbSBcImNvbnZleC9zZXJ2ZXJcIjtcblxuLyoqXG4gKiBBIHV0aWxpdHkgZm9yIHJlZmVyZW5jaW5nIENvbnZleCBmdW5jdGlvbnMgaW4geW91ciBhcHAncyBBUEkuXG4gKlxuICogVXNhZ2U6XG4gKiBgYGBqc1xuICogY29uc3QgbXlGdW5jdGlvblJlZmVyZW5jZSA9IGFwaS5teU1vZHVsZS5teUZ1bmN0aW9uO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjb25zdCBhcGkgPSBhbnlBcGk7XG5leHBvcnQgY29uc3QgaW50ZXJuYWwgPSBhbnlBcGk7XG5leHBvcnQgY29uc3QgY29tcG9uZW50cyA9IGNvbXBvbmVudHNHZW5lcmljKCk7XG4iLCJjb25zdCBTVE9SQUdFX0tFWSA9IFwidm9jYWJpZnlfZGV2aWNlX2lkXCI7XG5cbmZ1bmN0aW9uIGdlbmVyYXRlVVVJRCgpOiBzdHJpbmcge1xuICByZXR1cm4gY3J5cHRvLnJhbmRvbVVVSUQoKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldERldmljZUlkKCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChTVE9SQUdFX0tFWSkgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0pIHtcbiAgICByZXR1cm4gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgfVxuICBjb25zdCBpZCA9IGdlbmVyYXRlVVVJRCgpO1xuICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbU1RPUkFHRV9LRVldOiBpZCB9KTtcbiAgcmV0dXJuIGlkO1xufVxuIiwiaW50ZXJmYWNlIE15TWVtb3J5UmVzcG9uc2Uge1xuICByZXNwb25zZURhdGE6IHtcbiAgICB0cmFuc2xhdGVkVGV4dDogc3RyaW5nO1xuICAgIG1hdGNoOiBudW1iZXI7XG4gIH07XG4gIHJlc3BvbnNlU3RhdHVzOiBudW1iZXI7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoV2l0aFRpbWVvdXQoXG4gIHVybDogc3RyaW5nLFxuICBpbml0OiBSZXF1ZXN0SW5pdCxcbiAgdGltZW91dE1zID0gNjAwMCxcbik6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgY29uc3QgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXRNcyk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCh1cmwsIHsgLi4uaW5pdCwgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICByZXR1cm4gcmVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgaWYgKGUgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gJiYgZS5uYW1lID09PSBcIkFib3J0RXJyb3JcIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmVxdWVzdCB0aW1lZCBvdXRcIik7XG4gICAgfVxuICAgIHRocm93IGU7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJ5TXlNZW1vcnkod29yZDogc3RyaW5nLCBsYW5nOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCB1cmwgPSBuZXcgVVJMKFwiaHR0cHM6Ly9hcGkubXltZW1vcnkudHJhbnNsYXRlZC5uZXQvZ2V0XCIpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInFcIiwgd29yZCk7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwibGFuZ3BhaXJcIiwgYGVufCR7bGFuZ31gKTtcblxuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHVybC50b1N0cmluZygpLCB7fSwgNjAwMCk7XG4gIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYE15TWVtb3J5IEhUVFAgJHtyZXMuc3RhdHVzfWApO1xuXG4gIGNvbnN0IGRhdGE6IE15TWVtb3J5UmVzcG9uc2UgPSBhd2FpdCByZXMuanNvbigpO1xuICBpZiAoZGF0YS5yZXNwb25zZVN0YXR1cyAhPT0gMjAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBNeU1lbW9yeSBBUEkgZXJyb3I6ICR7ZGF0YS5yZXNwb25zZVN0YXR1c31gKTtcbiAgfVxuXG4gIGNvbnN0IHRyYW5zbGF0aW9uID0gZGF0YS5yZXNwb25zZURhdGEudHJhbnNsYXRlZFRleHQ7XG5cbiAgLy8gR3VhcmQ6IHJlamVjdCBpZiB0aGUgQVBJIGVjaG9lcyBiYWNrIHRoZSBpbnB1dCB1bmNoYW5nZWRcbiAgaWYgKHRyYW5zbGF0aW9uLnRvTG93ZXJDYXNlKCkudHJpbSgpID09PSB3b3JkLnRvTG93ZXJDYXNlKCkudHJpbSgpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTXlNZW1vcnkgcmV0dXJuZWQgaW5wdXQgdW5jaGFuZ2VkXCIpO1xuICB9XG5cbiAgcmV0dXJuIHRyYW5zbGF0aW9uO1xufVxuXG5hc3luYyBmdW5jdGlvbiB0cnlMaWJyZVRyYW5zbGF0ZShcbiAgd29yZDogc3RyaW5nLFxuICBsYW5nOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KFxuICAgIFwiaHR0cHM6Ly9saWJyZXRyYW5zbGF0ZS5jb20vdHJhbnNsYXRlXCIsXG4gICAge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgcTogd29yZCxcbiAgICAgICAgc291cmNlOiBcImVuXCIsXG4gICAgICAgIHRhcmdldDogbGFuZyxcbiAgICAgIH0pLFxuICAgIH0sXG4gICAgNjAwMCxcbiAgKTtcblxuICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBMaWJyZVRyYW5zbGF0ZSBIVFRQICR7cmVzLnN0YXR1c31gKTtcblxuICBjb25zdCBkYXRhID0gKGF3YWl0IHJlcy5qc29uKCkpIGFzIHsgdHJhbnNsYXRlZFRleHQ/OiBzdHJpbmcgfTtcbiAgaWYgKCFkYXRhLnRyYW5zbGF0ZWRUZXh0KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTGlicmVUcmFuc2xhdGUgcmV0dXJuZWQgbm8gdHJhbnNsYXRpb25cIik7XG4gIH1cblxuICByZXR1cm4gZGF0YS50cmFuc2xhdGVkVGV4dDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJ5R29vZ2xlVHJhbnNsYXRlKFxuICB3b3JkOiBzdHJpbmcsXG4gIGxhbmc6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoXCJodHRwczovL3RyYW5zbGF0ZS5nb29nbGVhcGlzLmNvbS90cmFuc2xhdGVfYS9zaW5nbGVcIik7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwiY2xpZW50XCIsIFwiZ3R4XCIpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInNsXCIsIFwiZW5cIik7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwidGxcIiwgbGFuZyk7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwiZHRcIiwgXCJ0XCIpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInFcIiwgd29yZCk7XG5cbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dCh1cmwudG9TdHJpbmcoKSwge30sIDYwMDApO1xuICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBHb29nbGUgVHJhbnNsYXRlIEhUVFAgJHtyZXMuc3RhdHVzfWApO1xuXG4gIC8vIFJlc3BvbnNlIGlzIG5lc3RlZCBhcnJheXM6IFtbW1widHJhbnNsYXRlZFwiLFwib3JpZ2luYWxcIiwuLi5dLC4uLl0sLi4uXVxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgY29uc3QgdHJhbnNsYXRpb24gPSBkYXRhPy5bMF1cbiAgICA/Lm1hcCgoc2VnbWVudDogW3N0cmluZ10pID0+IHNlZ21lbnRbMF0pXG4gICAgLmpvaW4oXCJcIik7XG5cbiAgaWYgKCF0cmFuc2xhdGlvbikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkdvb2dsZSBUcmFuc2xhdGUgcmV0dXJuZWQgbm8gdHJhbnNsYXRpb25cIik7XG4gIH1cblxuICBpZiAodHJhbnNsYXRpb24udG9Mb3dlckNhc2UoKS50cmltKCkgPT09IHdvcmQudG9Mb3dlckNhc2UoKS50cmltKCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJHb29nbGUgVHJhbnNsYXRlIHJldHVybmVkIGlucHV0IHVuY2hhbmdlZFwiKTtcbiAgfVxuXG4gIHJldHVybiB0cmFuc2xhdGlvbjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0VGFyZ2V0TGFuZygpOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcInRhcmdldExhbmdcIikgYXMgeyB0YXJnZXRMYW5nPzogc3RyaW5nIH07XG4gICAgcmV0dXJuIGRhdGEudGFyZ2V0TGFuZyB8fCBcInJ1XCI7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBcInJ1XCI7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRyYW5zbGF0ZVdvcmQoXG4gIHdvcmQ6IHN0cmluZyxcbiAgdGFyZ2V0TGFuZz86IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGxhbmcgPSB0YXJnZXRMYW5nID8/IGF3YWl0IGdldFRhcmdldExhbmcoKTtcbiAgLy8gVHJ5IE15TWVtb3J5IGZpcnN0XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IHRyeU15TWVtb3J5KHdvcmQsIGxhbmcpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBGYWxsIHRocm91Z2hcbiAgfVxuXG4gIC8vIFRyeSBMaWJyZVRyYW5zbGF0ZSBhcyBmYWxsYmFja1xuICB0cnkge1xuICAgIHJldHVybiBhd2FpdCB0cnlMaWJyZVRyYW5zbGF0ZSh3b3JkLCBsYW5nKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gRmFsbCB0aHJvdWdoXG4gIH1cblxuICAvLyBUcnkgR29vZ2xlIFRyYW5zbGF0ZSBhcyBsYXN0IHJlc29ydFxuICB0cnkge1xuICAgIHJldHVybiBhd2FpdCB0cnlHb29nbGVUcmFuc2xhdGUod29yZCwgbGFuZyk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIEFsbCBmYWlsZWRcbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihcIkFsbCB0cmFuc2xhdGlvbiBzZXJ2aWNlcyBmYWlsZWRcIik7XG59XG4iLCJjb25zdCBTVE9SQUdFX0tFWSA9IFwidm9jYWJpZnlQcm9cIjtcblxuaW50ZXJmYWNlIFByb0RhdGEge1xuICBpc1BybzogYm9vbGVhbjtcbiAgYWlDYWxsc1RvZGF5OiBudW1iZXI7XG4gIGFpQ2FsbHNSZXNldERhdGU6IHN0cmluZztcbn1cblxuY29uc3QgRlJFRV9EQUlMWV9MSU1JVCA9IDE7XG5jb25zdCBQUk9fREFJTFlfTElNSVQgPSAxMDtcblxuZnVuY3Rpb24gdG9kYXlTdHIoKTogc3RyaW5nIHtcbiAgcmV0dXJuIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRQcm9EYXRhKCk6IFByb21pc2U8UHJvRGF0YT4ge1xuICBjb25zdCBkYXRhID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFNUT1JBR0VfS0VZKSBhcyBSZWNvcmQ8c3RyaW5nLCBQcm9EYXRhIHwgdW5kZWZpbmVkPjtcbiAgcmV0dXJuIGRhdGFbU1RPUkFHRV9LRVldID8/IHsgaXNQcm86IGZhbHNlLCBhaUNhbGxzVG9kYXk6IDAsIGFpQ2FsbHNSZXNldERhdGU6IHRvZGF5U3RyKCkgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd3JpdGVQcm9EYXRhKGRhdGE6IFByb0RhdGEpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW1NUT1JBR0VfS0VZXTogZGF0YSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFByb1N0YXR1cygpOiBQcm9taXNlPHsgaXNQcm86IGJvb2xlYW47IGFpQ2FsbHNUb2RheTogbnVtYmVyIH0+IHtcbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlYWRQcm9EYXRhKCk7XG4gIC8vIEF1dG8tcmVzZXQgZGFpbHkgY291bnRlclxuICBpZiAoZGF0YS5haUNhbGxzUmVzZXREYXRlICE9PSB0b2RheVN0cigpKSB7XG4gICAgZGF0YS5haUNhbGxzVG9kYXkgPSAwO1xuICAgIGRhdGEuYWlDYWxsc1Jlc2V0RGF0ZSA9IHRvZGF5U3RyKCk7XG4gICAgYXdhaXQgd3JpdGVQcm9EYXRhKGRhdGEpO1xuICB9XG4gIHJldHVybiB7IGlzUHJvOiBkYXRhLmlzUHJvLCBhaUNhbGxzVG9kYXk6IGRhdGEuYWlDYWxsc1RvZGF5IH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjYW5NYWtlQWlDYWxsKCk6IFByb21pc2U8eyBhbGxvd2VkOiBib29sZWFuOyByZW1haW5pbmc6IG51bWJlciB9PiB7XG4gIGNvbnN0IHsgaXNQcm8sIGFpQ2FsbHNUb2RheSB9ID0gYXdhaXQgZ2V0UHJvU3RhdHVzKCk7XG4gIGNvbnN0IGxpbWl0ID0gaXNQcm8gPyBQUk9fREFJTFlfTElNSVQgOiBGUkVFX0RBSUxZX0xJTUlUO1xuICBjb25zdCByZW1haW5pbmcgPSBNYXRoLm1heCgwLCBsaW1pdCAtIGFpQ2FsbHNUb2RheSk7XG4gIHJldHVybiB7IGFsbG93ZWQ6IHJlbWFpbmluZyA+IDAsIHJlbWFpbmluZyB9O1xufVxuXG4vKipcbiAqIEF0b21pY2FsbHkgY2hlY2sgKyBpbmNyZW1lbnQgQUkgY2FsbHMuIFJldHVybnMgd2hldGhlciB0aGUgY2FsbCBpcyBhbGxvd2VkLlxuICogVXNlIHRoaXMgaW5zdGVhZCBvZiBzZXBhcmF0ZSBjYW5NYWtlQWlDYWxsKCkgKyBpbmNyZW1lbnRBaUNhbGxzKCkgdG8gYXZvaWQgcmFjZSBjb25kaXRpb25zLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHJ5Q29uc3VtZUFpQ2FsbCgpOiBQcm9taXNlPHsgYWxsb3dlZDogYm9vbGVhbjsgcmVtYWluaW5nOiBudW1iZXIgfT4ge1xuICBjb25zdCBkYXRhID0gYXdhaXQgcmVhZFByb0RhdGEoKTtcbiAgaWYgKGRhdGEuYWlDYWxsc1Jlc2V0RGF0ZSAhPT0gdG9kYXlTdHIoKSkge1xuICAgIGRhdGEuYWlDYWxsc1RvZGF5ID0gMDtcbiAgICBkYXRhLmFpQ2FsbHNSZXNldERhdGUgPSB0b2RheVN0cigpO1xuICB9XG4gIGNvbnN0IGxpbWl0ID0gZGF0YS5pc1BybyA/IFBST19EQUlMWV9MSU1JVCA6IEZSRUVfREFJTFlfTElNSVQ7XG4gIGlmIChkYXRhLmFpQ2FsbHNUb2RheSA+PSBsaW1pdCkge1xuICAgIHJldHVybiB7IGFsbG93ZWQ6IGZhbHNlLCByZW1haW5pbmc6IDAgfTtcbiAgfVxuICBkYXRhLmFpQ2FsbHNUb2RheSArPSAxO1xuICBhd2FpdCB3cml0ZVByb0RhdGEoZGF0YSk7XG4gIHJldHVybiB7IGFsbG93ZWQ6IHRydWUsIHJlbWFpbmluZzogTWF0aC5tYXgoMCwgbGltaXQgLSBkYXRhLmFpQ2FsbHNUb2RheSkgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudEFpQ2FsbHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZWFkUHJvRGF0YSgpO1xuICBpZiAoZGF0YS5haUNhbGxzUmVzZXREYXRlICE9PSB0b2RheVN0cigpKSB7XG4gICAgZGF0YS5haUNhbGxzVG9kYXkgPSAxO1xuICAgIGRhdGEuYWlDYWxsc1Jlc2V0RGF0ZSA9IHRvZGF5U3RyKCk7XG4gIH0gZWxzZSB7XG4gICAgZGF0YS5haUNhbGxzVG9kYXkgKz0gMTtcbiAgfVxuICBhd2FpdCB3cml0ZVByb0RhdGEoZGF0YSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRQcm9TdGF0dXMoaXNQcm86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlYWRQcm9EYXRhKCk7XG4gIGRhdGEuaXNQcm8gPSBpc1BybztcbiAgYXdhaXQgd3JpdGVQcm9EYXRhKGRhdGEpO1xufVxuIiwiaW1wb3J0IHsgQ29udmV4SHR0cENsaWVudCB9IGZyb20gXCJjb252ZXgvYnJvd3NlclwiO1xuaW1wb3J0IHsgYXBpIH0gZnJvbSBcIi4uL2NvbnZleC9fZ2VuZXJhdGVkL2FwaVwiO1xuaW1wb3J0IHsgZ2V0RGV2aWNlSWQgfSBmcm9tIFwiLi4vc3JjL2xpYi9kZXZpY2UtaWRcIjtcbmltcG9ydCB7IHRyYW5zbGF0ZVdvcmQgfSBmcm9tIFwiLi4vc3JjL2xpYi90cmFuc2xhdGVcIjtcbmltcG9ydCB7IGNhbk1ha2VBaUNhbGwsIGluY3JlbWVudEFpQ2FsbHMsIHRyeUNvbnN1bWVBaUNhbGwgfSBmcm9tIFwiLi4vc3JjL2xpYi9wcm8tZ2F0ZVwiO1xuaW1wb3J0IHR5cGUgeyBJZCB9IGZyb20gXCIuLi9jb252ZXgvX2dlbmVyYXRlZC9kYXRhTW9kZWxcIjtcblxuY29uc3QgUkVWSUVXX0FMQVJNID0gXCJ2b2NhYmlmeS1yZXZpZXdcIjtcbmNvbnN0IFJBREFSX0RFQ0FZX0FMQVJNID0gXCJ2b2NhYmlmeS1yYWRhci1kZWNheVwiO1xuXG4vLyAtLS0gVHlwZS1zYWZlIG1lc3NhZ2UgdHlwZXMgLS0tXG50eXBlIFRyYW5zbGF0ZU1lc3NhZ2UgPSB7IHR5cGU6IFwiVFJBTlNMQVRFX1dPUkRcIjsgd29yZDogc3RyaW5nOyBsYW5nPzogc3RyaW5nIH07XG50eXBlIEdldFN0YXRzTWVzc2FnZSA9IHsgdHlwZTogXCJHRVRfU1RBVFNcIiB9O1xudHlwZSBHZXRBY2hpZXZlbWVudHNNZXNzYWdlID0geyB0eXBlOiBcIkdFVF9BQ0hJRVZFTUVOVFNcIiB9O1xudHlwZSBTYXZlTWVzc2FnZSA9IHtcbiAgdHlwZTogXCJTQVZFX1dPUkRcIjtcbiAgd29yZDogc3RyaW5nO1xuICB0cmFuc2xhdGlvbjogc3RyaW5nO1xuICBleGFtcGxlPzogc3RyaW5nO1xuICBzb3VyY2VVcmw/OiBzdHJpbmc7XG4gIGV4YW1wbGVDb250ZXh0Pzogc3RyaW5nW107XG4gIGV4YW1wbGVTb3VyY2U/OiBzdHJpbmc7XG59O1xudHlwZSBSZXZpZXdSZXN1bHRNZXNzYWdlID0ge1xuICB0eXBlOiBcIlJFVklFV19SRVNVTFRcIjtcbiAgd29yZElkOiBzdHJpbmc7XG4gIHJlbWVtYmVyZWQ6IGJvb2xlYW47XG59O1xudHlwZSBHZXREZXZpY2VJZE1lc3NhZ2UgPSB7IHR5cGU6IFwiR0VUX0RFVklDRV9JRFwiIH07XG50eXBlIFNjYW5QYWdlTWVzc2FnZSA9IHsgdHlwZTogXCJTQ0FOX1BBR0VcIjsgd29yZHM6IHN0cmluZ1tdIH07XG50eXBlIEdldFZvY2FiQ2FjaGVNZXNzYWdlID0geyB0eXBlOiBcIkdFVF9WT0NBQl9DQUNIRVwiIH07XG50eXBlIEFpRXhwbGFpbk1lc3NhZ2UgPSB7XG4gIHR5cGU6IFwiQUlfRVhQTEFJTlwiO1xuICB3b3JkOiBzdHJpbmc7XG4gIHNlbnRlbmNlOiBzdHJpbmc7XG4gIHRhcmdldExhbmc/OiBzdHJpbmc7XG4gIHVzZXJMZXZlbD86IHN0cmluZztcbn07XG50eXBlIEFpU2ltcGxpZnlNZXNzYWdlID0geyB0eXBlOiBcIkFJX1NJTVBMSUZZXCI7IHRleHQ6IHN0cmluZzsgdXNlckxldmVsPzogc3RyaW5nIH07XG50eXBlIENoZWNrUHJvTWVzc2FnZSA9IHsgdHlwZTogXCJDSEVDS19QUk9cIiB9O1xudHlwZSBHZXRXb3JkQnlMZW1tYU1lc3NhZ2UgPSB7IHR5cGU6IFwiR0VUX1dPUkRfQllfTEVNTUFcIjsgbGVtbWE6IHN0cmluZzsgd29yZD86IHN0cmluZyB9O1xudHlwZSBUb2dnbGVIYXJkTWVzc2FnZSA9IHsgdHlwZTogXCJUT0dHTEVfSEFSRFwiOyB3b3JkSWQ6IHN0cmluZyB9O1xudHlwZSBBZGRDb250ZXh0TWVzc2FnZSA9IHsgdHlwZTogXCJBRERfQ09OVEVYVFwiOyB3b3JkSWQ6IHN0cmluZzsgc2VudGVuY2U6IHN0cmluZzsgdXJsOiBzdHJpbmcgfTtcbnR5cGUgRGVsZXRlV29yZE1lc3NhZ2UgPSB7IHR5cGU6IFwiREVMRVRFX1dPUkRcIjsgd29yZElkOiBzdHJpbmcgfTtcbi8vIFlvdVR1YmUgc3VidGl0bGUgdHlwZXMgcmVtb3ZlZCDigJQgbm93IHVzaW5nIERPTS1iYXNlZCBjYXB0aW9uIG9ic2VydmF0aW9uXG5cbnR5cGUgQXBwTWVzc2FnZSA9XG4gIHwgVHJhbnNsYXRlTWVzc2FnZVxuICB8IFNhdmVNZXNzYWdlXG4gIHwgUmV2aWV3UmVzdWx0TWVzc2FnZVxuICB8IEdldERldmljZUlkTWVzc2FnZVxuICB8IFNjYW5QYWdlTWVzc2FnZVxuICB8IEdldFZvY2FiQ2FjaGVNZXNzYWdlXG4gIHwgQWlFeHBsYWluTWVzc2FnZVxuICB8IEFpU2ltcGxpZnlNZXNzYWdlXG4gIHwgQ2hlY2tQcm9NZXNzYWdlXG4gIHwgR2V0V29yZEJ5TGVtbWFNZXNzYWdlXG4gIHwgVG9nZ2xlSGFyZE1lc3NhZ2VcbiAgfCBBZGRDb250ZXh0TWVzc2FnZVxuICB8IEdldFN0YXRzTWVzc2FnZVxuICB8IEdldEFjaGlldmVtZW50c01lc3NhZ2VcbiAgfCBEZWxldGVXb3JkTWVzc2FnZVxuO1xuXG5mdW5jdGlvbiBpc1ZhbGlkTWVzc2FnZShtc2c6IHVua25vd24pOiBtc2cgaXMgQXBwTWVzc2FnZSB7XG4gIGlmICghbXNnIHx8IHR5cGVvZiBtc2cgIT09IFwib2JqZWN0XCIgfHwgIShcInR5cGVcIiBpbiBtc2cpKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IG0gPSBtc2cgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIHN3aXRjaCAobS50eXBlKSB7XG4gICAgY2FzZSBcIlRSQU5TTEFURV9XT1JEXCI6XG4gICAgICByZXR1cm4gdHlwZW9mIG0ud29yZCA9PT0gXCJzdHJpbmdcIjtcbiAgICBjYXNlIFwiU0FWRV9XT1JEXCI6XG4gICAgICByZXR1cm4gdHlwZW9mIG0ud29yZCA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgbS50cmFuc2xhdGlvbiA9PT0gXCJzdHJpbmdcIjtcbiAgICBjYXNlIFwiUkVWSUVXX1JFU1VMVFwiOlxuICAgICAgcmV0dXJuIHR5cGVvZiBtLndvcmRJZCA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgbS5yZW1lbWJlcmVkID09PSBcImJvb2xlYW5cIjtcbiAgICBjYXNlIFwiR0VUX0RFVklDRV9JRFwiOlxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgY2FzZSBcIlNDQU5fUEFHRVwiOlxuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkobS53b3Jkcyk7XG4gICAgY2FzZSBcIkdFVF9WT0NBQl9DQUNIRVwiOlxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgY2FzZSBcIkFJX0VYUExBSU5cIjpcbiAgICAgIHJldHVybiB0eXBlb2YgbS53b3JkID09PSBcInN0cmluZ1wiICYmIHR5cGVvZiBtLnNlbnRlbmNlID09PSBcInN0cmluZ1wiO1xuICAgIGNhc2UgXCJBSV9TSU1QTElGWVwiOlxuICAgICAgcmV0dXJuIHR5cGVvZiBtLnRleHQgPT09IFwic3RyaW5nXCI7XG4gICAgY2FzZSBcIkNIRUNLX1BST1wiOlxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgY2FzZSBcIkdFVF9XT1JEX0JZX0xFTU1BXCI6XG4gICAgICByZXR1cm4gdHlwZW9mIG0ubGVtbWEgPT09IFwic3RyaW5nXCI7XG4gICAgY2FzZSBcIlRPR0dMRV9IQVJEXCI6XG4gICAgICByZXR1cm4gdHlwZW9mIG0ud29yZElkID09PSBcInN0cmluZ1wiO1xuICAgIGNhc2UgXCJBRERfQ09OVEVYVFwiOlxuICAgICAgcmV0dXJuIHR5cGVvZiBtLndvcmRJZCA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgbS5zZW50ZW5jZSA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgbS51cmwgPT09IFwic3RyaW5nXCI7XG4gICAgY2FzZSBcIkdFVF9TVEFUU1wiOlxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgY2FzZSBcIkdFVF9BQ0hJRVZFTUVOVFNcIjpcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGNhc2UgXCJERUxFVEVfV09SRFwiOlxuICAgICAgcmV0dXJuIHR5cGVvZiBtLndvcmRJZCA9PT0gXCJzdHJpbmdcIjtcbiAgICAvLyBZb3VUdWJlIHN1YnRpdGxlIGNhc2VzIHJlbW92ZWQg4oCUIG5vdyB1c2luZyBET00tYmFzZWQgY2FwdGlvbiBvYnNlcnZhdGlvblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLy8gRmlyZS1hbmQtZm9yZ2V0IGV2ZW50IGxvZ2dpbmcg4oCUIG5ldmVyIGJsb2NrcyB0aGUgbWFpbiBmbG93XG5mdW5jdGlvbiBsb2dFdmVudChcbiAgY29udmV4OiBDb252ZXhIdHRwQ2xpZW50LFxuICBkZXZpY2VJZDogc3RyaW5nLFxuICB0eXBlOiBcIndvcmRfbG9va3VwXCIgfCBcIndvcmRfc2F2ZWRcIiB8IFwicmV2aWV3X3JlbWVtYmVyZWRcIiB8IFwicmV2aWV3X2ZvcmdvdFwiIHwgXCJ0b2FzdF9zaG93blwiLFxuICB3b3JkPzogc3RyaW5nLFxuKSB7XG4gIGNvbnZleFxuICAgIC5tdXRhdGlvbihhcGkuZXZlbnRzLmxvZ0V2ZW50LCB7IGRldmljZUlkLCB0eXBlLCB3b3JkIH0pXG4gICAgLmNhdGNoKCgpID0+IHt9KTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQmFja2dyb3VuZCgoKSA9PiB7XG4gIGNvbnN0IGNvbnZleCA9IG5ldyBDb252ZXhIdHRwQ2xpZW50KFxuICAgIGltcG9ydC5tZXRhLmVudi5WSVRFX0NPTlZFWF9VUkwgYXMgc3RyaW5nLFxuICApO1xuXG4gIC8vIC0tLSBVcGRhdGUgd29yZCBjb3VudCBiYWRnZSAtLS1cbiAgYXN5bmMgZnVuY3Rpb24gdXBkYXRlQmFkZ2UoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGRldmljZUlkID0gYXdhaXQgZ2V0RGV2aWNlSWQoKTtcbiAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS53b3Jkcy5zdGF0cywgeyBkZXZpY2VJZCB9KTtcbiAgICAgIGNvbnN0IGNvdW50ID0gc3RhdHMudG90YWw7XG4gICAgICBjaHJvbWUuYWN0aW9uLnNldEJhZGdlVGV4dCh7IHRleHQ6IGNvdW50ID4gMCA/IFN0cmluZyhjb3VudCkgOiBcIlwiIH0pO1xuICAgICAgY2hyb21lLmFjdGlvbi5zZXRCYWRnZUJhY2tncm91bmRDb2xvcih7IGNvbG9yOiBcIiMzYjgyZjZcIiB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFNpbGVudGx5IGZhaWwg4oCUIGJhZGdlIGlzIG5vbi1jcml0aWNhbFxuICAgIH1cbiAgfVxuXG4gIGNocm9tZS5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKGFzeW5jICgpID0+IHtcbiAgICBhd2FpdCBnZXREZXZpY2VJZCgpO1xuICAgIC8vIFJlc3BlY3QgdXNlcidzIHJldmlldyBpbnRlcnZhbCBzZXR0aW5nIChkZWZhdWx0OiAzMCBtaW4pXG4gICAgY29uc3Qgc2V0dGluZ3MgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcInJldmlld0ludGVydmFsTWludXRlc1wiKSBhcyB7IHJldmlld0ludGVydmFsTWludXRlcz86IG51bWJlciB9O1xuICAgIGNvbnN0IGludGVydmFsID0gc2V0dGluZ3MucmV2aWV3SW50ZXJ2YWxNaW51dGVzID8/IDMwO1xuICAgIGNocm9tZS5hbGFybXMuY3JlYXRlKFJFVklFV19BTEFSTSwgeyBwZXJpb2RJbk1pbnV0ZXM6IGludGVydmFsIH0pO1xuICAgIGNocm9tZS5hbGFybXMuY3JlYXRlKFJBREFSX0RFQ0FZX0FMQVJNLCB7IHBlcmlvZEluTWludXRlczogNjAgKiAyNCB9KTtcblxuICAgIC8vIENyZWF0ZSBjb250ZXh0IG1lbnVzXG4gICAgY2hyb21lLmNvbnRleHRNZW51cy5jcmVhdGUoe1xuICAgICAgaWQ6IFwidm9jYWJpZnktdHJhbnNsYXRlXCIsXG4gICAgICB0aXRsZTogXCJUcmFuc2xhdGUgd2l0aCBWb2NhYmlmeVwiLFxuICAgICAgY29udGV4dHM6IFtcInNlbGVjdGlvblwiXSxcbiAgICB9KTtcbiAgICBjaHJvbWUuY29udGV4dE1lbnVzLmNyZWF0ZSh7XG4gICAgICBpZDogXCJ2b2NhYmlmeS1zYXZlXCIsXG4gICAgICB0aXRsZTogXCJTYXZlIHRvIFZvY2FiaWZ5XCIsXG4gICAgICBjb250ZXh0czogW1wic2VsZWN0aW9uXCJdLFxuICAgIH0pO1xuXG4gICAgLy8gU2V0IGluaXRpYWwgYmFkZ2VcbiAgICB1cGRhdGVCYWRnZSgpO1xuICB9KTtcblxuICAvLyAtLS0gQ29udGV4dCBtZW51IGhhbmRsZXIgLS0tXG4gIGNocm9tZS5jb250ZXh0TWVudXMub25DbGlja2VkLmFkZExpc3RlbmVyKGFzeW5jIChpbmZvLCB0YWIpID0+IHtcbiAgICBpZiAoIXRhYj8uaWQgfHwgIWluZm8uc2VsZWN0aW9uVGV4dCkgcmV0dXJuO1xuICAgIGNvbnN0IHRleHQgPSBpbmZvLnNlbGVjdGlvblRleHQudHJpbSgpO1xuICAgIGlmICghdGV4dCB8fCB0ZXh0Lmxlbmd0aCA8IDIgfHwgdGV4dC5sZW5ndGggPiA0MCkgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmIChpbmZvLm1lbnVJdGVtSWQgPT09IFwidm9jYWJpZnktdHJhbnNsYXRlXCIpIHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiLmlkLCB7XG4gICAgICAgICAgdHlwZTogXCJDT05URVhUX01FTlVfVFJBTlNMQVRFXCIsXG4gICAgICAgICAgd29yZDogdGV4dCxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKGluZm8ubWVudUl0ZW1JZCA9PT0gXCJ2b2NhYmlmeS1zYXZlXCIpIHtcbiAgICAgICAgLy8gVHJhbnNsYXRlIHRoZW4gc2F2ZVxuICAgICAgICBjb25zdCBkZXZpY2VJZCA9IGF3YWl0IGdldERldmljZUlkKCk7XG4gICAgICAgIGNvbnN0IHRyYW5zbGF0aW9uID0gYXdhaXQgdHJhbnNsYXRlV29yZCh0ZXh0KTtcbiAgICAgICAgYXdhaXQgY29udmV4Lm11dGF0aW9uKGFwaS53b3Jkcy5hZGQsIHtcbiAgICAgICAgICBkZXZpY2VJZCxcbiAgICAgICAgICB3b3JkOiB0ZXh0LFxuICAgICAgICAgIHRyYW5zbGF0aW9uLFxuICAgICAgICAgIGV4YW1wbGU6IFwiXCIsXG4gICAgICAgICAgc291cmNlVXJsOiB0YWIudXJsIHx8IFwiXCIsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dFdmVudChjb252ZXgsIGRldmljZUlkLCBcIndvcmRfc2F2ZWRcIiwgdGV4dCk7XG4gICAgICAgIGNvbnN0IHhwUmVzdWx0ID0gYXdhaXQgY29udmV4Lm11dGF0aW9uKGFwaS5nYW1pZmljYXRpb24uYXdhcmRYcCwge1xuICAgICAgICAgIGRldmljZUlkLFxuICAgICAgICAgIGFjdGlvbjogXCJ3b3JkX3NhdmVkXCIsXG4gICAgICAgIH0pO1xuICAgICAgICB1cGRhdGVCYWRnZSgpO1xuICAgICAgICAvLyBOb3RpZnkgY29udGVudCBzY3JpcHQgb2Ygc3VjY2Vzc2Z1bCBzYXZlXG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYi5pZCwge1xuICAgICAgICAgIHR5cGU6IFwiQ09OVEVYVF9NRU5VX1NBVkVEXCIsXG4gICAgICAgICAgd29yZDogdGV4dCxcbiAgICAgICAgICB0cmFuc2xhdGlvbixcbiAgICAgICAgICB4cDogeHBSZXN1bHQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJbVm9jYWJpZnldIENvbnRleHQgbWVudSBlcnJvcjpcIiwgZSk7XG4gICAgfVxuICB9KTtcblxuICAvLyAtLS0gS2V5Ym9hcmQgc2hvcnRjdXQgaGFuZGxlciAtLS1cbiAgY2hyb21lLmNvbW1hbmRzLm9uQ29tbWFuZC5hZGRMaXN0ZW5lcihhc3luYyAoY29tbWFuZCkgPT4ge1xuICAgIGlmIChjb21tYW5kICE9PSBcInRyYW5zbGF0ZS1zZWxlY3Rpb25cIikgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSk7XG4gICAgICBjb25zdCB0YWIgPSB0YWJzWzBdO1xuICAgICAgaWYgKCF0YWI/LmlkKSByZXR1cm47XG4gICAgICBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWIuaWQsIHsgdHlwZTogXCJLRVlCT0FSRF9UUkFOU0xBVEVcIiB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIENvbnRlbnQgc2NyaXB0IG5vdCBhdmFpbGFibGVcbiAgICB9XG4gIH0pO1xuXG4gIGNocm9tZS5hbGFybXMub25BbGFybS5hZGRMaXN0ZW5lcihhc3luYyAoYWxhcm0pID0+IHtcbiAgICAvLyBSYWRhciBkZWNheTogcmVtb3ZlIGVudHJpZXMgb2xkZXIgdGhhbiA3IGRheXNcbiAgICBpZiAoYWxhcm0ubmFtZSA9PT0gUkFEQVJfREVDQVlfQUxBUk0pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJ2b2NhYmlmeVJhZGFyXCIpIGFzIFJlY29yZDxzdHJpbmcsIHsgc2VlbjogUmVjb3JkPHN0cmluZywgeyBjb3VudDogbnVtYmVyOyBsYXN0U2VlbkF0OiBudW1iZXIgfT4gfSB8IHVuZGVmaW5lZD47XG4gICAgICAgIGNvbnN0IHJhZGFyID0gZGF0YS52b2NhYmlmeVJhZGFyO1xuICAgICAgICBpZiAoIXJhZGFyPy5zZWVuKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHNldmVuRGF5c0FnbyA9IERhdGUubm93KCkgLSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDtcbiAgICAgICAgY29uc3QgZmlsdGVyZWQ6IFJlY29yZDxzdHJpbmcsIHsgY291bnQ6IG51bWJlcjsgbGFzdFNlZW5BdDogbnVtYmVyIH0+ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2xlbW1hLCBlbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMocmFkYXIuc2VlbikpIHtcbiAgICAgICAgICBpZiAoZW50cnkubGFzdFNlZW5BdCA+PSBzZXZlbkRheXNBZ28pIHtcbiAgICAgICAgICAgIGZpbHRlcmVkW2xlbW1hXSA9IGVudHJ5O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyB2b2NhYmlmeVJhZGFyOiB7IHNlZW46IGZpbHRlcmVkIH0gfSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbVm9jYWJpZnldIFJhZGFyIGRlY2F5IGVycm9yOlwiLCBlKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoYWxhcm0ubmFtZSAhPT0gUkVWSUVXX0FMQVJNKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgZGV2aWNlSWQgPSBhd2FpdCBnZXREZXZpY2VJZCgpO1xuXG4gICAgICAvLyBSZWFkIGNvbmZpZ3VyYWJsZSBpbnRlcnZhbCwgRE5ELCBhbmQgdG9hc3QgbGltaXQgZnJvbSBzdG9yYWdlXG4gICAgICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFtcbiAgICAgICAgXCJyZXZpZXdJbnRlcnZhbE1pbnV0ZXNcIixcbiAgICAgICAgXCJkbmRVbnRpbFwiLFxuICAgICAgICBcIm1heFRvYXN0c1BlckRheVwiLFxuICAgICAgXSkgYXMgeyByZXZpZXdJbnRlcnZhbE1pbnV0ZXM/OiBudW1iZXI7IGRuZFVudGlsPzogbnVtYmVyOyBtYXhUb2FzdHNQZXJEYXk/OiBudW1iZXIgfTtcbiAgICAgIGlmIChzZXR0aW5ncy5kbmRVbnRpbCAmJiBEYXRlLm5vdygpIDwgc2V0dGluZ3MuZG5kVW50aWwpIHJldHVybjtcblxuICAgICAgLy8gRGFpbHkgdG9hc3QgbGltaXQgY2hlY2tcbiAgICAgIGNvbnN0IG1heFRvYXN0cyA9IHNldHRpbmdzLm1heFRvYXN0c1BlckRheSA/PyAxNTtcbiAgICAgIGNvbnN0IHRvYXN0RGF0YSA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbXG4gICAgICAgIFwidG9hc3RzU2hvd25Ub2RheVwiLFxuICAgICAgICBcImxhc3RUb2FzdFJlc2V0RGF0ZVwiLFxuICAgICAgXSkgYXMgeyB0b2FzdHNTaG93blRvZGF5PzogbnVtYmVyOyBsYXN0VG9hc3RSZXNldERhdGU/OiBzdHJpbmcgfTtcblxuICAgICAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICAgICAgbGV0IHRvYXN0c1Nob3duID0gdG9hc3REYXRhLnRvYXN0c1Nob3duVG9kYXkgPz8gMDtcbiAgICAgIGlmICh0b2FzdERhdGEubGFzdFRvYXN0UmVzZXREYXRlICE9PSB0b2RheSkge1xuICAgICAgICB0b2FzdHNTaG93biA9IDA7XG4gICAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHRvYXN0c1Nob3duVG9kYXk6IDAsIGxhc3RUb2FzdFJlc2V0RGF0ZTogdG9kYXkgfSk7XG4gICAgICB9XG4gICAgICBpZiAodG9hc3RzU2hvd24gPj0gbWF4VG9hc3RzKSByZXR1cm47XG5cbiAgICAgIGNvbnN0IHdvcmRzID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS53b3Jkcy5nZXRSZXZpZXdXb3Jkcywge1xuICAgICAgICBkZXZpY2VJZCxcbiAgICAgICAgbGltaXQ6IDEsXG4gICAgICB9KTtcblxuICAgICAgaWYgKHdvcmRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe1xuICAgICAgICBhY3RpdmU6IHRydWUsXG4gICAgICAgIGN1cnJlbnRXaW5kb3c6IHRydWUsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHRhYiA9IHRhYnNbMF07XG4gICAgICBpZiAoIXRhYj8uaWQpIHJldHVybjsgLy8gTm8gYWN0aXZlIHRhYiAoZS5nLiwgYWxsIHdpbmRvd3MgbWluaW1pemVkKVxuXG4gICAgICAvLyBTa2lwIGNocm9tZTovLyBhbmQgb3RoZXIgcmVzdHJpY3RlZCBVUkxzXG4gICAgICBpZiAodGFiLnVybCAmJiAodGFiLnVybC5zdGFydHNXaXRoKFwiY2hyb21lOi8vXCIpIHx8IHRhYi51cmwuc3RhcnRzV2l0aChcImNocm9tZS1leHRlbnNpb246Ly9cIikpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiLmlkLCB7XG4gICAgICAgICAgdHlwZTogXCJTSE9XX1JFVklFV1wiLFxuICAgICAgICAgIHdvcmQ6IHdvcmRzWzBdLFxuICAgICAgICB9KTtcbiAgICAgICAgLy8gSW5jcmVtZW50IGRhaWx5IHRvYXN0IGNvdW50ZXJcbiAgICAgICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgdG9hc3RzU2hvd25Ub2RheTogdG9hc3RzU2hvd24gKyAxIH0pO1xuICAgICAgICAvLyBMb2cgdG9hc3Rfc2hvd24gZXZlbnRcbiAgICAgICAgbG9nRXZlbnQoY29udmV4LCBkZXZpY2VJZCwgXCJ0b2FzdF9zaG93blwiLCB3b3Jkc1swXS53b3JkKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBDb250ZW50IHNjcmlwdCBub3QgbG9hZGVkIG9uIHRoaXMgdGFiIOKAlCBza2lwIHNpbGVudGx5XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIltWb2NhYmlmeV0gQWxhcm0gaGFuZGxlciBlcnJvcjpcIiwgZSk7XG4gICAgfVxuICB9KTtcblxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgaWYgKCFpc1ZhbGlkTWVzc2FnZShtZXNzYWdlKSkge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgZXJyb3I6IFwiVW5rbm93biBtZXNzYWdlIHR5cGVcIiB9KTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBoYW5kbGVNZXNzYWdlKG1lc3NhZ2UsIGNvbnZleCwgdXBkYXRlQmFkZ2UpLnRoZW4oc2VuZFJlc3BvbnNlKTtcbiAgICByZXR1cm4gdHJ1ZTsgLy8ga2VlcCBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlXG4gIH0pO1xufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZU1lc3NhZ2UobWVzc2FnZTogQXBwTWVzc2FnZSwgY29udmV4OiBDb252ZXhIdHRwQ2xpZW50LCB1cGRhdGVCYWRnZTogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuICBjb25zdCBkZXZpY2VJZCA9IGF3YWl0IGdldERldmljZUlkKCk7XG5cbiAgc3dpdGNoIChtZXNzYWdlLnR5cGUpIHtcbiAgICBjYXNlIFwiVFJBTlNMQVRFX1dPUkRcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdHJhbnNsYXRpb24gPSBhd2FpdCB0cmFuc2xhdGVXb3JkKG1lc3NhZ2Uud29yZCwgbWVzc2FnZS5sYW5nKTtcbiAgICAgICAgbG9nRXZlbnQoY29udmV4LCBkZXZpY2VJZCwgXCJ3b3JkX2xvb2t1cFwiLCBtZXNzYWdlLndvcmQpO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCB0cmFuc2xhdGlvbiB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlKSB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNhc2UgXCJTQVZFX1dPUkRcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgd29yZElkID0gYXdhaXQgY29udmV4Lm11dGF0aW9uKGFwaS53b3Jkcy5hZGQsIHtcbiAgICAgICAgICBkZXZpY2VJZCxcbiAgICAgICAgICB3b3JkOiBtZXNzYWdlLndvcmQsXG4gICAgICAgICAgdHJhbnNsYXRpb246IG1lc3NhZ2UudHJhbnNsYXRpb24sXG4gICAgICAgICAgZXhhbXBsZTogbWVzc2FnZS5leGFtcGxlIHx8IFwiXCIsXG4gICAgICAgICAgc291cmNlVXJsOiBtZXNzYWdlLnNvdXJjZVVybCB8fCBcIlwiLFxuICAgICAgICAgIGV4YW1wbGVDb250ZXh0OiBtZXNzYWdlLmV4YW1wbGVDb250ZXh0LFxuICAgICAgICAgIGV4YW1wbGVTb3VyY2U6IG1lc3NhZ2UuZXhhbXBsZVNvdXJjZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ0V2ZW50KGNvbnZleCwgZGV2aWNlSWQsIFwid29yZF9zYXZlZFwiLCBtZXNzYWdlLndvcmQpO1xuICAgICAgICAvLyBBd2FyZCBYUCBmb3Igc2F2aW5nIHdvcmRcbiAgICAgICAgY29uc3QgeHBSZXN1bHQgPSBhd2FpdCBjb252ZXgubXV0YXRpb24oYXBpLmdhbWlmaWNhdGlvbi5hd2FyZFhwLCB7XG4gICAgICAgICAgZGV2aWNlSWQsXG4gICAgICAgICAgYWN0aW9uOiBcIndvcmRfc2F2ZWRcIixcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZUJhZGdlKCk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHhwOiB4cFJlc3VsdCwgd29yZElkIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgY2FzZSBcIlJFVklFV19SRVNVTFRcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udmV4Lm11dGF0aW9uKGFwaS53b3Jkcy51cGRhdGVSZXZpZXcsIHtcbiAgICAgICAgICBpZDogbWVzc2FnZS53b3JkSWQgYXMgSWQ8XCJ3b3Jkc1wiPixcbiAgICAgICAgICBkZXZpY2VJZCxcbiAgICAgICAgICByZW1lbWJlcmVkOiBtZXNzYWdlLnJlbWVtYmVyZWQsXG4gICAgICAgIH0pO1xuICAgICAgICBsb2dFdmVudChcbiAgICAgICAgICBjb252ZXgsXG4gICAgICAgICAgZGV2aWNlSWQsXG4gICAgICAgICAgbWVzc2FnZS5yZW1lbWJlcmVkID8gXCJyZXZpZXdfcmVtZW1iZXJlZFwiIDogXCJyZXZpZXdfZm9yZ290XCIsXG4gICAgICAgICk7XG4gICAgICAgIC8vIEF3YXJkIFhQIGZvciByZXZpZXdcbiAgICAgICAgY29uc3QgeHBSZXN1bHQgPSBhd2FpdCBjb252ZXgubXV0YXRpb24oYXBpLmdhbWlmaWNhdGlvbi5hd2FyZFhwLCB7XG4gICAgICAgICAgZGV2aWNlSWQsXG4gICAgICAgICAgYWN0aW9uOiBtZXNzYWdlLnJlbWVtYmVyZWQgPyBcInJldmlld19yZW1lbWJlcmVkXCIgOiBcInJldmlld19mb3Jnb3RcIixcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB7IFxuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxuICAgICAgICAgIG5ld1N0YXR1czogcmVzdWx0Py5uZXdTdGF0dXMsIFxuICAgICAgICAgIGludGVydmFsRGF5czogcmVzdWx0Py5pbnRlcnZhbERheXMsXG4gICAgICAgICAgeHA6IHhwUmVzdWx0LFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlKSB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNhc2UgXCJHRVRfREVWSUNFX0lEXCI6IHtcbiAgICAgIHJldHVybiB7IGRldmljZUlkIH07XG4gICAgfVxuXG4gICAgY2FzZSBcIlNDQU5fUEFHRVwiOiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzYXZlZFdvcmRzID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS53b3Jkcy5nZXRXb3JkU2V0LCB7IGRldmljZUlkIH0pO1xuICAgICAgICBjb25zdCBzYXZlZFNldCA9IG5ldyBTZXQoc2F2ZWRXb3Jkcy5tYXAoKHc6IHN0cmluZykgPT4gdy50b0xvd2VyQ2FzZSgpKSk7XG4gICAgICAgIGNvbnN0IHVuc2F2ZWQgPSBtZXNzYWdlLndvcmRzLmZpbHRlcigodzogc3RyaW5nKSA9PiAhc2F2ZWRTZXQuaGFzKHcudG9Mb3dlckNhc2UoKSkpO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCB3b3JkczogdW5zYXZlZC5zbGljZSgwLCAxMCkgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjYXNlIFwiR0VUX1ZPQ0FCX0NBQ0hFXCI6IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNhY2hlID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS53b3Jkcy5nZXRWb2NhYkNhY2hlLCB7IGRldmljZUlkIH0pO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCAuLi5jYWNoZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlKSB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNhc2UgXCJBSV9FWFBMQUlOXCI6IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIEF0b21pYyBjaGVjaytjb25zdW1lIHRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25cbiAgICAgICAgY29uc3QgY29uc3VtZWQgPSBhd2FpdCB0cnlDb25zdW1lQWlDYWxsKCk7XG4gICAgICAgIGlmICghY29uc3VtZWQuYWxsb3dlZCkge1xuICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogXCJEYWlseSBBSSBsaW1pdCByZWFjaGVkXCIsIHJlbWFpbmluZzogMCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnZleC5hY3Rpb24oYXBpLmFpLmV4cGxhaW5Xb3JkLCB7XG4gICAgICAgICAgd29yZDogbWVzc2FnZS53b3JkLFxuICAgICAgICAgIHNlbnRlbmNlOiBtZXNzYWdlLnNlbnRlbmNlLFxuICAgICAgICAgIHRhcmdldExhbmc6IG1lc3NhZ2UudGFyZ2V0TGFuZyxcbiAgICAgICAgICB1c2VyTGV2ZWw6IG1lc3NhZ2UudXNlckxldmVsLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZXhwbGFuYXRpb246IHJlc3VsdC5leHBsYW5hdGlvbiwgcmVtYWluaW5nOiBjb25zdW1lZC5yZW1haW5pbmcgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjYXNlIFwiQUlfU0lNUExJRllcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQXRvbWljIGNoZWNrK2NvbnN1bWUgdG8gcHJldmVudCByYWNlIGNvbmRpdGlvblxuICAgICAgICBjb25zdCBjb25zdW1lZCA9IGF3YWl0IHRyeUNvbnN1bWVBaUNhbGwoKTtcbiAgICAgICAgaWYgKCFjb25zdW1lZC5hbGxvd2VkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBcIkRhaWx5IEFJIGxpbWl0IHJlYWNoZWRcIiwgcmVtYWluaW5nOiAwIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udmV4LmFjdGlvbihhcGkuYWkuc2ltcGxpZnlUZXh0LCB7XG4gICAgICAgICAgdGV4dDogbWVzc2FnZS50ZXh0LFxuICAgICAgICAgIHVzZXJMZXZlbDogbWVzc2FnZS51c2VyTGV2ZWwsXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgc2ltcGxpZmllZDogcmVzdWx0LnNpbXBsaWZpZWQsXG4gICAgICAgICAgb3JpZ2luYWxMZW5ndGg6IG1lc3NhZ2UudGV4dC5sZW5ndGgsXG4gICAgICAgICAgcmVtYWluaW5nOiBjb25zdW1lZC5yZW1haW5pbmcsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgY2FzZSBcIkNIRUNLX1BST1wiOiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzdGF0dXMgPSBhd2FpdCBjYW5NYWtlQWlDYWxsKCk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIC4uLnN0YXR1cyB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlKSB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNhc2UgXCJHRVRfV09SRF9CWV9MRU1NQVwiOiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3b3JkID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS53b3Jkcy5nZXRCeUxlbW1hLCB7XG4gICAgICAgICAgZGV2aWNlSWQsXG4gICAgICAgICAgbGVtbWE6IG1lc3NhZ2UubGVtbWEsXG4gICAgICAgICAgd29yZDogbWVzc2FnZS53b3JkLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgd29yZCB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlKSB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGNhc2UgXCJUT0dHTEVfSEFSRFwiOiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjb252ZXgubXV0YXRpb24oYXBpLndvcmRzLnRvZ2dsZUhhcmQsIHtcbiAgICAgICAgICBpZDogbWVzc2FnZS53b3JkSWQgYXMgSWQ8XCJ3b3Jkc1wiPixcbiAgICAgICAgICBkZXZpY2VJZCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjYXNlIFwiQUREX0NPTlRFWFRcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29udmV4Lm11dGF0aW9uKGFwaS53b3Jkcy5hZGRDb250ZXh0LCB7XG4gICAgICAgICAgaWQ6IG1lc3NhZ2Uud29yZElkIGFzIElkPFwid29yZHNcIj4sXG4gICAgICAgICAgZGV2aWNlSWQsXG4gICAgICAgICAgc2VudGVuY2U6IG1lc3NhZ2Uuc2VudGVuY2UsXG4gICAgICAgICAgdXJsOiBtZXNzYWdlLnVybCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGR1cGxpY2F0ZTogcmVzdWx0Py5kdXBsaWNhdGUgPz8gZmFsc2UgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjYXNlIFwiR0VUX1NUQVRTXCI6IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS5nYW1pZmljYXRpb24uZ2V0U3RhdHMsIHsgZGV2aWNlSWQgfSk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHN0YXRzIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgY2FzZSBcIkdFVF9BQ0hJRVZFTUVOVFNcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYWNoaWV2ZW1lbnRzID0gYXdhaXQgY29udmV4LnF1ZXJ5KGFwaS5nYW1pZmljYXRpb24uZ2V0QWNoaWV2ZW1lbnRzLCB7IGRldmljZUlkIH0pO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBhY2hpZXZlbWVudHMgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjYXNlIFwiREVMRVRFX1dPUkRcIjoge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY29udmV4Lm11dGF0aW9uKGFwaS53b3Jkcy5yZW1vdmUsIHtcbiAgICAgICAgICBpZDogbWVzc2FnZS53b3JkSWQgYXMgSWQ8XCJ3b3Jkc1wiPixcbiAgICAgICAgICBkZXZpY2VJZCxcbiAgICAgICAgfSk7XG4gICAgICAgIHVwZGF0ZUJhZGdlKCk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgICAgIH1cbiAgICB9XG5cblxuICB9XG59XG4iLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG5cbi8vI3JlZ2lvbiBzcmMvYnJvd3Nlci50c1xuLyoqXG4qIENvbnRhaW5zIHRoZSBgYnJvd3NlcmAgZXhwb3J0IHdoaWNoIHlvdSBzaG91bGQgdXNlIHRvIGFjY2VzcyB0aGUgZXh0ZW5zaW9uIEFQSXMgaW4geW91ciBwcm9qZWN0OlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBicm93c2VyIH0gZnJvbSAnd3h0L2Jyb3dzZXInO1xuKlxuKiBicm93c2VyLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuKiAgIC8vIC4uLlxuKiB9KVxuKiBgYGBcbiogQG1vZHVsZSB3eHQvYnJvd3NlclxuKi9cbmNvbnN0IGJyb3dzZXIgPSBicm93c2VyJDE7XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9OyIsIi8vIHNyYy9pbmRleC50c1xudmFyIF9NYXRjaFBhdHRlcm4gPSBjbGFzcyB7XG4gIGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybikge1xuICAgIGlmIChtYXRjaFBhdHRlcm4gPT09IFwiPGFsbF91cmxzPlwiKSB7XG4gICAgICB0aGlzLmlzQWxsVXJscyA9IHRydWU7XG4gICAgICB0aGlzLnByb3RvY29sTWF0Y2hlcyA9IFsuLi5fTWF0Y2hQYXR0ZXJuLlBST1RPQ09MU107XG4gICAgICB0aGlzLmhvc3RuYW1lTWF0Y2ggPSBcIipcIjtcbiAgICAgIHRoaXMucGF0aG5hbWVNYXRjaCA9IFwiKlwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBncm91cHMgPSAvKC4qKTpcXC9cXC8oLio/KShcXC8uKikvLmV4ZWMobWF0Y2hQYXR0ZXJuKTtcbiAgICAgIGlmIChncm91cHMgPT0gbnVsbClcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBcIkluY29ycmVjdCBmb3JtYXRcIik7XG4gICAgICBjb25zdCBbXywgcHJvdG9jb2wsIGhvc3RuYW1lLCBwYXRobmFtZV0gPSBncm91cHM7XG4gICAgICB2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpO1xuICAgICAgdmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKTtcbiAgICAgIHZhbGlkYXRlUGF0aG5hbWUobWF0Y2hQYXR0ZXJuLCBwYXRobmFtZSk7XG4gICAgICB0aGlzLnByb3RvY29sTWF0Y2hlcyA9IHByb3RvY29sID09PSBcIipcIiA/IFtcImh0dHBcIiwgXCJodHRwc1wiXSA6IFtwcm90b2NvbF07XG4gICAgICB0aGlzLmhvc3RuYW1lTWF0Y2ggPSBob3N0bmFtZTtcbiAgICAgIHRoaXMucGF0aG5hbWVNYXRjaCA9IHBhdGhuYW1lO1xuICAgIH1cbiAgfVxuICBpbmNsdWRlcyh1cmwpIHtcbiAgICBpZiAodGhpcy5pc0FsbFVybHMpXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCB1ID0gdHlwZW9mIHVybCA9PT0gXCJzdHJpbmdcIiA/IG5ldyBVUkwodXJsKSA6IHVybCBpbnN0YW5jZW9mIExvY2F0aW9uID8gbmV3IFVSTCh1cmwuaHJlZikgOiB1cmw7XG4gICAgcmV0dXJuICEhdGhpcy5wcm90b2NvbE1hdGNoZXMuZmluZCgocHJvdG9jb2wpID0+IHtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJodHRwXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzSHR0cE1hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImh0dHBzXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzSHR0cHNNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJmaWxlXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzRmlsZU1hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImZ0cFwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0Z0cE1hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcInVyblwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc1Vybk1hdGNoKHUpO1xuICAgIH0pO1xuICB9XG4gIGlzSHR0cE1hdGNoKHVybCkge1xuICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cDpcIiAmJiB0aGlzLmlzSG9zdFBhdGhNYXRjaCh1cmwpO1xuICB9XG4gIGlzSHR0cHNNYXRjaCh1cmwpIHtcbiAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSBcImh0dHBzOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG4gIH1cbiAgaXNIb3N0UGF0aE1hdGNoKHVybCkge1xuICAgIGlmICghdGhpcy5ob3N0bmFtZU1hdGNoIHx8ICF0aGlzLnBhdGhuYW1lTWF0Y2gpXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgaG9zdG5hbWVNYXRjaFJlZ2V4cyA9IFtcbiAgICAgIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaCksXG4gICAgICB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLmhvc3RuYW1lTWF0Y2gucmVwbGFjZSgvXlxcKlxcLi8sIFwiXCIpKVxuICAgIF07XG4gICAgY29uc3QgcGF0aG5hbWVNYXRjaFJlZ2V4ID0gdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5wYXRobmFtZU1hdGNoKTtcbiAgICByZXR1cm4gISFob3N0bmFtZU1hdGNoUmVnZXhzLmZpbmQoKHJlZ2V4KSA9PiByZWdleC50ZXN0KHVybC5ob3N0bmFtZSkpICYmIHBhdGhuYW1lTWF0Y2hSZWdleC50ZXN0KHVybC5wYXRobmFtZSk7XG4gIH1cbiAgaXNGaWxlTWF0Y2godXJsKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IGZpbGU6Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGlzRnRwTWF0Y2godXJsKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IGZ0cDovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgaXNVcm5NYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogdXJuOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBjb252ZXJ0UGF0dGVyblRvUmVnZXgocGF0dGVybikge1xuICAgIGNvbnN0IGVzY2FwZWQgPSB0aGlzLmVzY2FwZUZvclJlZ2V4KHBhdHRlcm4pO1xuICAgIGNvbnN0IHN0YXJzUmVwbGFjZWQgPSBlc2NhcGVkLnJlcGxhY2UoL1xcXFxcXCovZywgXCIuKlwiKTtcbiAgICByZXR1cm4gUmVnRXhwKGBeJHtzdGFyc1JlcGxhY2VkfSRgKTtcbiAgfVxuICBlc2NhcGVGb3JSZWdleChzdHJpbmcpIHtcbiAgICByZXR1cm4gc3RyaW5nLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcbiAgfVxufTtcbnZhciBNYXRjaFBhdHRlcm4gPSBfTWF0Y2hQYXR0ZXJuO1xuTWF0Y2hQYXR0ZXJuLlBST1RPQ09MUyA9IFtcImh0dHBcIiwgXCJodHRwc1wiLCBcImZpbGVcIiwgXCJmdHBcIiwgXCJ1cm5cIl07XG52YXIgSW52YWxpZE1hdGNoUGF0dGVybiA9IGNsYXNzIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4sIHJlYXNvbikge1xuICAgIHN1cGVyKGBJbnZhbGlkIG1hdGNoIHBhdHRlcm4gXCIke21hdGNoUGF0dGVybn1cIjogJHtyZWFzb259YCk7XG4gIH1cbn07XG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpIHtcbiAgaWYgKCFNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmluY2x1ZGVzKHByb3RvY29sKSAmJiBwcm90b2NvbCAhPT0gXCIqXCIpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4oXG4gICAgICBtYXRjaFBhdHRlcm4sXG4gICAgICBgJHtwcm90b2NvbH0gbm90IGEgdmFsaWQgcHJvdG9jb2wgKCR7TWF0Y2hQYXR0ZXJuLlBST1RPQ09MUy5qb2luKFwiLCBcIil9KWBcbiAgICApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKSB7XG4gIGlmIChob3N0bmFtZS5pbmNsdWRlcyhcIjpcIikpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBgSG9zdG5hbWUgY2Fubm90IGluY2x1ZGUgYSBwb3J0YCk7XG4gIGlmIChob3N0bmFtZS5pbmNsdWRlcyhcIipcIikgJiYgaG9zdG5hbWUubGVuZ3RoID4gMSAmJiAhaG9zdG5hbWUuc3RhcnRzV2l0aChcIiouXCIpKVxuICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKFxuICAgICAgbWF0Y2hQYXR0ZXJuLFxuICAgICAgYElmIHVzaW5nIGEgd2lsZGNhcmQgKCopLCBpdCBtdXN0IGdvIGF0IHRoZSBzdGFydCBvZiB0aGUgaG9zdG5hbWVgXG4gICAgKTtcbn1cbmZ1bmN0aW9uIHZhbGlkYXRlUGF0aG5hbWUobWF0Y2hQYXR0ZXJuLCBwYXRobmFtZSkge1xuICByZXR1cm47XG59XG5leHBvcnQge1xuICBJbnZhbGlkTWF0Y2hQYXR0ZXJuLFxuICBNYXRjaFBhdHRlcm5cbn07XG4iXSwibmFtZXMiOlsibGVuIiwiYXJyIiwiaSIsImxlbjIiLCJCYXNlNjQuZnJvbUJ5dGVBcnJheSIsIkJhc2U2NC50b0J5dGVBcnJheSIsIl9fZGVmUHJvcCIsIl9fZGVmTm9ybWFsUHJvcCIsIl9fcHVibGljRmllbGQiLCJsb2dnZXIiLCJyZXN1bHQiLCJTVE9SQUdFX0tFWSIsImJyb3dzZXIiXSwibWFwcGluZ3MiOiI7O0FBQ0EsV0FBUyxpQkFBaUIsS0FBSztBQUM5QixRQUFJLE9BQU8sUUFBUSxPQUFPLFFBQVEsV0FBWSxRQUFPLEVBQUUsTUFBTSxJQUFHO0FBQ2hFLFdBQU87QUFBQSxFQUNSO0FDSE8sUUFBTSxVQUFVO0FDQXZCLE1BQUksU0FBUyxDQUFBO0FBQ2IsTUFBSSxZQUFZLENBQUE7QUFDaEIsTUFBSSxNQUFNO0FBQ1YsTUFBSSxPQUFPO0FBQ1gsV0FBUyxJQUFJLEdBQUcsTUFBTSxLQUFLLFFBQVEsSUFBSSxLQUFLLEVBQUUsR0FBRztBQUMvQyxXQUFPLENBQUMsSUFBSSxLQUFLLENBQUM7QUFDbEIsY0FBVSxLQUFLLFdBQVcsQ0FBQyxDQUFDLElBQUk7QUFBQSxFQUNsQztBQUNBLFlBQVUsSUFBSSxXQUFXLENBQUMsQ0FBQyxJQUFJO0FBQy9CLFlBQVUsSUFBSSxXQUFXLENBQUMsQ0FBQyxJQUFJO0FBQy9CLFdBQVMsUUFBUSxLQUFLO0FBQ3BCLFFBQUlBLE9BQU0sSUFBSTtBQUNkLFFBQUlBLE9BQU0sSUFBSSxHQUFHO0FBQ2YsWUFBTSxJQUFJLE1BQU0sZ0RBQWdEO0FBQUEsSUFDbEU7QUFDQSxRQUFJLFdBQVcsSUFBSSxRQUFRLEdBQUc7QUFDOUIsUUFBSSxhQUFhLEdBQUksWUFBV0E7QUFDaEMsUUFBSSxrQkFBa0IsYUFBYUEsT0FBTSxJQUFJLElBQUksV0FBVztBQUM1RCxXQUFPLENBQUMsVUFBVSxlQUFlO0FBQUEsRUFDbkM7QUFPQSxXQUFTLFlBQVksTUFBTSxVQUFVLGlCQUFpQjtBQUNwRCxZQUFRLFdBQVcsbUJBQW1CLElBQUksSUFBSTtBQUFBLEVBQ2hEO0FBQ08sV0FBUyxZQUFZLEtBQUs7QUFDL0IsUUFBSTtBQUNKLFFBQUksT0FBTyxRQUFRLEdBQUc7QUFDdEIsUUFBSSxXQUFXLEtBQUssQ0FBQztBQUNyQixRQUFJLGtCQUFrQixLQUFLLENBQUM7QUFDNUIsUUFBSUMsT0FBTSxJQUFJLElBQUksWUFBWSxLQUFLLFVBQVUsZUFBZSxDQUFDO0FBQzdELFFBQUksVUFBVTtBQUNkLFFBQUlELE9BQU0sa0JBQWtCLElBQUksV0FBVyxJQUFJO0FBQy9DLFFBQUlFO0FBQ0osU0FBS0EsS0FBSSxHQUFHQSxLQUFJRixNQUFLRSxNQUFLLEdBQUc7QUFDM0IsWUFBTSxVQUFVLElBQUksV0FBV0EsRUFBQyxDQUFDLEtBQUssS0FBSyxVQUFVLElBQUksV0FBV0EsS0FBSSxDQUFDLENBQUMsS0FBSyxLQUFLLFVBQVUsSUFBSSxXQUFXQSxLQUFJLENBQUMsQ0FBQyxLQUFLLElBQUksVUFBVSxJQUFJLFdBQVdBLEtBQUksQ0FBQyxDQUFDO0FBQzNKLE1BQUFELEtBQUksU0FBUyxJQUFJLE9BQU8sS0FBSztBQUM3QixNQUFBQSxLQUFJLFNBQVMsSUFBSSxPQUFPLElBQUk7QUFDNUIsTUFBQUEsS0FBSSxTQUFTLElBQUksTUFBTTtBQUFBLElBQ3pCO0FBQ0EsUUFBSSxvQkFBb0IsR0FBRztBQUN6QixZQUFNLFVBQVUsSUFBSSxXQUFXQyxFQUFDLENBQUMsS0FBSyxJQUFJLFVBQVUsSUFBSSxXQUFXQSxLQUFJLENBQUMsQ0FBQyxLQUFLO0FBQzlFLE1BQUFELEtBQUksU0FBUyxJQUFJLE1BQU07QUFBQSxJQUN6QjtBQUNBLFFBQUksb0JBQW9CLEdBQUc7QUFDekIsWUFBTSxVQUFVLElBQUksV0FBV0MsRUFBQyxDQUFDLEtBQUssS0FBSyxVQUFVLElBQUksV0FBV0EsS0FBSSxDQUFDLENBQUMsS0FBSyxJQUFJLFVBQVUsSUFBSSxXQUFXQSxLQUFJLENBQUMsQ0FBQyxLQUFLO0FBQ3ZILE1BQUFELEtBQUksU0FBUyxJQUFJLE9BQU8sSUFBSTtBQUM1QixNQUFBQSxLQUFJLFNBQVMsSUFBSSxNQUFNO0FBQUEsSUFDekI7QUFDQSxXQUFPQTtBQUFBLEVBQ1Q7QUFDQSxXQUFTLGdCQUFnQixLQUFLO0FBQzVCLFdBQU8sT0FBTyxPQUFPLEtBQUssRUFBRSxJQUFJLE9BQU8sT0FBTyxLQUFLLEVBQUUsSUFBSSxPQUFPLE9BQU8sSUFBSSxFQUFFLElBQUksT0FBTyxNQUFNLEVBQUU7QUFBQSxFQUNsRztBQUNBLFdBQVMsWUFBWSxPQUFPLE9BQU8sS0FBSztBQUN0QyxRQUFJO0FBQ0osUUFBSSxTQUFTLENBQUE7QUFDYixhQUFTQyxLQUFJLE9BQU9BLEtBQUksS0FBS0EsTUFBSyxHQUFHO0FBQ25DLGFBQU8sTUFBTUEsRUFBQyxLQUFLLEtBQUssYUFBYSxNQUFNQSxLQUFJLENBQUMsS0FBSyxJQUFJLFVBQVUsTUFBTUEsS0FBSSxDQUFDLElBQUk7QUFDbEYsYUFBTyxLQUFLLGdCQUFnQixHQUFHLENBQUM7QUFBQSxJQUNsQztBQUNBLFdBQU8sT0FBTyxLQUFLLEVBQUU7QUFBQSxFQUN2QjtBQUNPLFdBQVMsY0FBYyxPQUFPO0FBQ25DLFFBQUk7QUFDSixRQUFJRixPQUFNLE1BQU07QUFDaEIsUUFBSSxhQUFhQSxPQUFNO0FBQ3ZCLFFBQUksUUFBUSxDQUFBO0FBQ1osUUFBSSxpQkFBaUI7QUFDckIsYUFBU0UsS0FBSSxHQUFHQyxRQUFPSCxPQUFNLFlBQVlFLEtBQUlDLE9BQU1ELE1BQUssZ0JBQWdCO0FBQ3RFLFlBQU07QUFBQSxRQUNKO0FBQUEsVUFDRTtBQUFBLFVBQ0FBO0FBQUEsVUFDQUEsS0FBSSxpQkFBaUJDLFFBQU9BLFFBQU9ELEtBQUk7QUFBQSxRQUMvQztBQUFBLE1BQ0E7QUFBQSxJQUNFO0FBQ0EsUUFBSSxlQUFlLEdBQUc7QUFDcEIsWUFBTSxNQUFNRixPQUFNLENBQUM7QUFDbkIsWUFBTSxLQUFLLE9BQU8sT0FBTyxDQUFDLElBQUksT0FBTyxPQUFPLElBQUksRUFBRSxJQUFJLElBQUk7QUFBQSxJQUM1RCxXQUFXLGVBQWUsR0FBRztBQUMzQixhQUFPLE1BQU1BLE9BQU0sQ0FBQyxLQUFLLEtBQUssTUFBTUEsT0FBTSxDQUFDO0FBQzNDLFlBQU07QUFBQSxRQUNKLE9BQU8sT0FBTyxFQUFFLElBQUksT0FBTyxPQUFPLElBQUksRUFBRSxJQUFJLE9BQU8sT0FBTyxJQUFJLEVBQUUsSUFBSTtBQUFBLE1BQzFFO0FBQUEsSUFDRTtBQUNBLFdBQU8sTUFBTSxLQUFLLEVBQUU7QUFBQSxFQUN0QjtBQzVGTyxXQUFTLFVBQVUsTUFBTTtBQUM5QixRQUFJLFNBQVMsUUFBUTtBQUNuQixhQUFPLENBQUE7QUFBQSxJQUNUO0FBQ0EsUUFBSSxDQUFDLGVBQWUsSUFBSSxHQUFHO0FBQ3pCLFlBQU0sSUFBSTtBQUFBLFFBQ1IsbUVBQW1FLElBQUk7QUFBQSxNQUM3RTtBQUFBLElBQ0U7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUNPLFdBQVMsc0JBQXNCLGVBQWU7QUFDbkQsUUFBSSxPQUFPLGtCQUFrQixhQUFhO0FBQ3hDLFlBQU0sSUFBSTtBQUFBLFFBQ1I7QUFBQSxNQUNOO0FBQUEsSUFDRTtBQUNBLFFBQUksT0FBTyxrQkFBa0IsVUFBVTtBQUNyQyxZQUFNLElBQUk7QUFBQSxRQUNSLHFDQUFxQyxhQUFhO0FBQUEsTUFDeEQ7QUFBQSxJQUNFO0FBQ0EsUUFBSSxFQUFFLGNBQWMsV0FBVyxPQUFPLEtBQUssY0FBYyxXQUFXLFFBQVEsSUFBSTtBQUM5RSxZQUFNLElBQUk7QUFBQSxRQUNSLCtFQUErRSxhQUFhO0FBQUEsTUFDbEc7QUFBQSxJQUNFO0FBQ0EsUUFBSTtBQUNGLFVBQUksSUFBSSxhQUFhO0FBQUEsSUFDdkIsUUFBUTtBQUNOLFlBQU0sSUFBSTtBQUFBLFFBQ1IsZ0NBQWdDLGFBQWE7QUFBQSxNQUNuRDtBQUFBLElBQ0U7QUFDQSxRQUFJLGNBQWMsU0FBUyxjQUFjLEdBQUc7QUFDMUMsWUFBTSxJQUFJO0FBQUEsUUFDUixnQ0FBZ0MsYUFBYTtBQUFBLE1BQ25EO0FBQUEsSUFDRTtBQUFBLEVBQ0Y7QUFDTyxXQUFTLGVBQWUsT0FBTztBQUNwQyxVQUFNLFdBQVcsT0FBTyxVQUFVO0FBQ2xDLFVBQU0sWUFBWSxPQUFPLGVBQWUsS0FBSztBQUM3QyxVQUFNLFdBQVcsY0FBYyxRQUFRLGNBQWMsT0FBTztBQUFBO0FBQUEsSUFFNUQsV0FBVyxhQUFhLFNBQVM7QUFDakMsV0FBTyxZQUFZO0FBQUEsRUFDckI7QUM3Q0EsUUFBTSxnQkFBZ0I7QUFDdEIsUUFBTSxZQUFZLE9BQU8sc0JBQXNCO0FBQy9DLFFBQU0sWUFBWSxPQUFPLHFCQUFxQjtBQUM5QyxRQUFNLE9BQU8sT0FBTyxHQUFHO0FBQ3ZCLFFBQU0sUUFBUSxPQUFPLEdBQUc7QUFDeEIsUUFBTSxjQUFjLE9BQU8sS0FBSztBQUNoQyxXQUFTLFVBQVUsR0FBRztBQUNwQixXQUFPLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLFNBQVMsQ0FBQyxLQUFLLE9BQU8sR0FBRyxHQUFHLEVBQUU7QUFBQSxFQUNsRTtBQUNPLFdBQVMsbUJBQW1CLE9BQU87QUFDeEMsUUFBSSxRQUFRLE1BQU07QUFDaEIsZUFBUyxZQUFZO0FBQUEsSUFDdkI7QUFDQSxRQUFJLE1BQU0sTUFBTSxTQUFTLEVBQUU7QUFDM0IsUUFBSSxJQUFJLFNBQVMsTUFBTSxFQUFHLE9BQU0sTUFBTTtBQUN0QyxVQUFNLFFBQVEsSUFBSSxXQUFXLElBQUksWUFBWSxDQUFDLENBQUM7QUFDL0MsUUFBSUUsS0FBSTtBQUNSLGVBQVcsV0FBVyxJQUFJLE1BQU0sT0FBTyxFQUFFLFdBQVc7QUFDbEQsWUFBTSxJQUFJLENBQUMsU0FBUyxTQUFTLEVBQUUsQ0FBQyxHQUFHQSxJQUFHO0FBQ3RDLGdCQUFVO0FBQUEsSUFDWjtBQUNBLFdBQU9FLGNBQXFCLEtBQUs7QUFBQSxFQUNuQztBQUNPLFdBQVMsbUJBQW1CLFNBQVM7QUFDMUMsVUFBTSxlQUFlQyxZQUFtQixPQUFPO0FBQy9DLFFBQUksYUFBYSxlQUFlLEdBQUc7QUFDakMsWUFBTSxJQUFJO0FBQUEsUUFDUixZQUFZLGFBQWEsVUFBVTtBQUFBLE1BQ3pDO0FBQUEsSUFDRTtBQUNBLFFBQUksUUFBUTtBQUNaLFFBQUksUUFBUTtBQUNaLGVBQVcsUUFBUSxjQUFjO0FBQy9CLGVBQVMsT0FBTyxJQUFJLElBQUksZUFBZTtBQUN2QztBQUFBLElBQ0Y7QUFDQSxRQUFJLFFBQVEsV0FBVztBQUNyQixlQUFTLFlBQVk7QUFBQSxJQUN2QjtBQUNBLFdBQU87QUFBQSxFQUNUO0FBQ08sV0FBUyxxQkFBcUIsT0FBTztBQUMxQyxRQUFJLFFBQVEsYUFBYSxZQUFZLE9BQU87QUFDMUMsWUFBTSxJQUFJO0FBQUEsUUFDUixVQUFVLEtBQUs7QUFBQSxNQUNyQjtBQUFBLElBQ0U7QUFDQSxVQUFNLFNBQVMsSUFBSSxZQUFZLENBQUM7QUFDaEMsUUFBSSxTQUFTLE1BQU0sRUFBRSxZQUFZLEdBQUcsT0FBTyxJQUFJO0FBQy9DLFdBQU9ELGNBQXFCLElBQUksV0FBVyxNQUFNLENBQUM7QUFBQSxFQUNwRDtBQUNPLFdBQVMscUJBQXFCLFNBQVM7QUFDNUMsVUFBTSxlQUFlQyxZQUFtQixPQUFPO0FBQy9DLFFBQUksYUFBYSxlQUFlLEdBQUc7QUFDakMsWUFBTSxJQUFJO0FBQUEsUUFDUixZQUFZLGFBQWEsVUFBVTtBQUFBLE1BQ3pDO0FBQUEsSUFDRTtBQUNBLFVBQU0sZUFBZSxJQUFJLFNBQVMsYUFBYSxNQUFNO0FBQ3JELFdBQU8sYUFBYSxZQUFZLEdBQUcsSUFBSTtBQUFBLEVBQ3pDO0FBQ08sUUFBTSxpQkFBaUIsU0FBUyxVQUFVLGNBQWMsdUJBQXVCO0FBQy9FLFFBQU0saUJBQWlCLFNBQVMsVUFBVSxjQUFjLHVCQUF1QjtBQUN0RixRQUFNLHFCQUFxQjtBQUMzQixXQUFTLG9CQUFvQixHQUFHO0FBQzlCLFFBQUksRUFBRSxTQUFTLG9CQUFvQjtBQUNqQyxZQUFNLElBQUk7QUFBQSxRQUNSLGNBQWMsQ0FBQyxzQ0FBc0Msa0JBQWtCO0FBQUEsTUFDN0U7QUFBQSxJQUNFO0FBQ0EsUUFBSSxFQUFFLFdBQVcsR0FBRyxHQUFHO0FBQ3JCLFlBQU0sSUFBSSxNQUFNLGNBQWMsQ0FBQyx3Q0FBd0M7QUFBQSxJQUN6RTtBQUNBLGFBQVNILEtBQUksR0FBR0EsS0FBSSxFQUFFLFFBQVFBLE1BQUssR0FBRztBQUNwQyxZQUFNLFdBQVcsRUFBRSxXQUFXQSxFQUFDO0FBQy9CLFVBQUksV0FBVyxNQUFNLFlBQVksS0FBSztBQUNwQyxjQUFNLElBQUk7QUFBQSxVQUNSLGNBQWMsQ0FBQywyQkFBMkIsRUFBRUEsRUFBQyxDQUFDO0FBQUEsUUFDdEQ7QUFBQSxNQUNJO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDTyxXQUFTLGFBQWEsT0FBTztBQUNsQyxRQUFJLFVBQVUsTUFBTTtBQUNsQixhQUFPO0FBQUEsSUFDVDtBQUNBLFFBQUksT0FBTyxVQUFVLFdBQVc7QUFDOUIsYUFBTztBQUFBLElBQ1Q7QUFDQSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzdCLGFBQU87QUFBQSxJQUNUO0FBQ0EsUUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM3QixhQUFPO0FBQUEsSUFDVDtBQUNBLFFBQUksTUFBTSxRQUFRLEtBQUssR0FBRztBQUN4QixhQUFPLE1BQU0sSUFBSSxDQUFDLFdBQVcsYUFBYSxNQUFNLENBQUM7QUFBQSxJQUNuRDtBQUNBLFFBQUksT0FBTyxVQUFVLFVBQVU7QUFDN0IsWUFBTSxJQUFJLE1BQU0sc0JBQXNCLEtBQUssRUFBRTtBQUFBLElBQy9DO0FBQ0EsVUFBTSxVQUFVLE9BQU8sUUFBUSxLQUFLO0FBQ3BDLFFBQUksUUFBUSxXQUFXLEdBQUc7QUFDeEIsWUFBTSxNQUFNLFFBQVEsQ0FBQyxFQUFFLENBQUM7QUFDeEIsVUFBSSxRQUFRLFVBQVU7QUFDcEIsWUFBSSxPQUFPLE1BQU0sV0FBVyxVQUFVO0FBQ3BDLGdCQUFNLElBQUksTUFBTSw2QkFBNkIsS0FBSyxFQUFFO0FBQUEsUUFDdEQ7QUFDQSxlQUFPRyxZQUFtQixNQUFNLE1BQU0sRUFBRTtBQUFBLE1BQzFDO0FBQ0EsVUFBSSxRQUFRLFlBQVk7QUFDdEIsWUFBSSxPQUFPLE1BQU0sYUFBYSxVQUFVO0FBQ3RDLGdCQUFNLElBQUksTUFBTSwrQkFBK0IsS0FBSyxFQUFFO0FBQUEsUUFDeEQ7QUFDQSxlQUFPLGVBQWUsTUFBTSxRQUFRO0FBQUEsTUFDdEM7QUFDQSxVQUFJLFFBQVEsVUFBVTtBQUNwQixZQUFJLE9BQU8sTUFBTSxXQUFXLFVBQVU7QUFDcEMsZ0JBQU0sSUFBSSxNQUFNLDZCQUE2QixLQUFLLEVBQUU7QUFBQSxRQUN0RDtBQUNBLGNBQU0sYUFBYUEsWUFBbUIsTUFBTSxNQUFNO0FBQ2xELFlBQUksV0FBVyxlQUFlLEdBQUc7QUFDL0IsZ0JBQU0sSUFBSTtBQUFBLFlBQ1IsWUFBWSxXQUFXLFVBQVU7QUFBQSxVQUMzQztBQUFBLFFBQ007QUFDQSxjQUFNLGlCQUFpQixJQUFJLFNBQVMsV0FBVyxNQUFNO0FBQ3JELGNBQU0sUUFBUSxlQUFlLFdBQVcsR0FBRyxhQUFhO0FBQ3hELFlBQUksQ0FBQyxVQUFVLEtBQUssR0FBRztBQUNyQixnQkFBTSxJQUFJLE1BQU0sU0FBUyxLQUFLLGdDQUFnQztBQUFBLFFBQ2hFO0FBQ0EsZUFBTztBQUFBLE1BQ1Q7QUFDQSxVQUFJLFFBQVEsUUFBUTtBQUNsQixjQUFNLElBQUk7QUFBQSxVQUNSO0FBQUEsUUFDUjtBQUFBLE1BQ0k7QUFDQSxVQUFJLFFBQVEsUUFBUTtBQUNsQixjQUFNLElBQUk7QUFBQSxVQUNSO0FBQUEsUUFDUjtBQUFBLE1BQ0k7QUFBQSxJQUNGO0FBQ0EsVUFBTSxNQUFNLENBQUE7QUFDWixlQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssT0FBTyxRQUFRLEtBQUssR0FBRztBQUMxQywwQkFBb0IsQ0FBQztBQUNyQixVQUFJLENBQUMsSUFBSSxhQUFhLENBQUM7QUFBQSxJQUN6QjtBQUNBLFdBQU87QUFBQSxFQUNUO0FBQ0EsUUFBTSwwQkFBMEI7QUFDekIsV0FBUyx1QkFBdUIsT0FBTztBQUM1QyxVQUFNLE1BQU0sS0FBSyxVQUFVLE9BQU8sQ0FBQyxNQUFNLFdBQVc7QUFDbEQsVUFBSSxXQUFXLFFBQVE7QUFDckIsZUFBTztBQUFBLE1BQ1Q7QUFDQSxVQUFJLE9BQU8sV0FBVyxVQUFVO0FBQzlCLGVBQU8sR0FBRyxPQUFPLFNBQVEsQ0FBRTtBQUFBLE1BQzdCO0FBQ0EsYUFBTztBQUFBLElBQ1QsQ0FBQztBQUNELFFBQUksSUFBSSxTQUFTLHlCQUF5QjtBQUN4QyxZQUFNLE9BQU87QUFDYixVQUFJLGFBQWEsMEJBQTBCLEtBQUs7QUFDaEQsWUFBTSxZQUFZLElBQUksWUFBWSxhQUFhLENBQUM7QUFDaEQsVUFBSSxjQUFjLFVBQVUsWUFBWSxPQUFPO0FBQzdDLHNCQUFjO0FBQUEsTUFDaEI7QUFDQSxhQUFPLElBQUksVUFBVSxHQUFHLFVBQVUsSUFBSTtBQUFBLElBQ3hDO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFDQSxXQUFTLHFCQUFxQixPQUFPLGVBQWUsU0FBUywwQkFBMEI7QUFDckYsUUFBSSxVQUFVLFFBQVE7QUFDcEIsWUFBTSxjQUFjLFdBQVcscUJBQXFCLE9BQU8sdUJBQXVCO0FBQUEsUUFDaEY7QUFBQSxNQUNOLENBQUs7QUFDRCxZQUFNLElBQUk7QUFBQSxRQUNSLHdDQUF3QyxXQUFXO0FBQUEsTUFDekQ7QUFBQSxJQUNFO0FBQ0EsUUFBSSxVQUFVLE1BQU07QUFDbEIsYUFBTztBQUFBLElBQ1Q7QUFDQSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzdCLFVBQUksUUFBUSxhQUFhLFlBQVksT0FBTztBQUMxQyxjQUFNLElBQUk7QUFBQSxVQUNSLFVBQVUsS0FBSztBQUFBLFFBQ3ZCO0FBQUEsTUFDSTtBQUNBLGFBQU8sRUFBRSxVQUFVLGVBQWUsS0FBSyxFQUFDO0FBQUEsSUFDMUM7QUFDQSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzdCLFVBQUksVUFBVSxLQUFLLEdBQUc7QUFDcEIsY0FBTSxTQUFTLElBQUksWUFBWSxDQUFDO0FBQ2hDLFlBQUksU0FBUyxNQUFNLEVBQUUsV0FBVyxHQUFHLE9BQU8sYUFBYTtBQUN2RCxlQUFPLEVBQUUsUUFBUUQsY0FBcUIsSUFBSSxXQUFXLE1BQU0sQ0FBQyxFQUFDO0FBQUEsTUFDL0QsT0FBTztBQUNMLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUNBLFFBQUksT0FBTyxVQUFVLFdBQVc7QUFDOUIsYUFBTztBQUFBLElBQ1Q7QUFDQSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzdCLGFBQU87QUFBQSxJQUNUO0FBQ0EsUUFBSSxpQkFBaUIsYUFBYTtBQUNoQyxhQUFPLEVBQUUsUUFBUUEsY0FBcUIsSUFBSSxXQUFXLEtBQUssQ0FBQyxFQUFDO0FBQUEsSUFDOUQ7QUFDQSxRQUFJLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDeEIsYUFBTyxNQUFNO0FBQUEsUUFDWCxDQUFDLFFBQVFGLE9BQU0scUJBQXFCLFFBQVEsZUFBZSxVQUFVLElBQUlBLEVBQUMsR0FBVTtBQUFBLE1BQzFGO0FBQUEsSUFDRTtBQUNBLFFBQUksaUJBQWlCLEtBQUs7QUFDeEIsWUFBTSxJQUFJO0FBQUEsUUFDUiwrQkFBK0IsU0FBUyxPQUFPLENBQUMsR0FBRyxLQUFLLEdBQUcsYUFBYTtBQUFBLE1BQzlFO0FBQUEsSUFDRTtBQUNBLFFBQUksaUJBQWlCLEtBQUs7QUFDeEIsWUFBTSxJQUFJO0FBQUEsUUFDUiwrQkFBK0IsU0FBUyxPQUFPLENBQUMsR0FBRyxLQUFLLEdBQUcsYUFBYTtBQUFBLE1BQzlFO0FBQUEsSUFDRTtBQUNBLFFBQUksQ0FBQyxlQUFlLEtBQUssR0FBRztBQUMxQixZQUFNLFVBQVUsT0FBTyxhQUFhO0FBQ3BDLFlBQU0sV0FBVyxVQUFVLEdBQUcsT0FBTyxNQUFNO0FBQzNDLFlBQU0sSUFBSTtBQUFBLFFBQ1IsK0JBQStCLFNBQVMsVUFBVSxPQUFPLGFBQWE7QUFBQSxNQUM1RTtBQUFBLElBQ0U7QUFDQSxVQUFNLE1BQU0sQ0FBQTtBQUNaLFVBQU0sVUFBVSxPQUFPLFFBQVEsS0FBSztBQUNwQyxZQUFRLEtBQUssQ0FBQyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLE1BQU0sT0FBTyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssQ0FBQztBQUN2RSxlQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssU0FBUztBQUM1QixVQUFJLE1BQU0sUUFBUTtBQUNoQiw0QkFBb0IsQ0FBQztBQUNyQixZQUFJLENBQUMsSUFBSSxxQkFBcUIsR0FBRyxlQUFlLFVBQVUsSUFBSSxDQUFDLEVBQVM7QUFBQSxNQUMxRTtBQUFBLElBUUY7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUNBLFdBQVMsK0JBQStCLFNBQVMsVUFBVSxPQUFPLGVBQWU7QUFDL0UsUUFBSSxTQUFTO0FBQ1gsYUFBTyxHQUFHLFFBQVEsR0FBRztBQUFBLFFBQ25CO0FBQUEsTUFDTixDQUFLLG9EQUFvRCxPQUFPLHVCQUF1QjtBQUFBLFFBQ2pGO0FBQUEsTUFDTixDQUFLO0FBQUEsSUFDSCxPQUFPO0FBQ0wsYUFBTyxHQUFHLFFBQVEsR0FBRztBQUFBLFFBQ25CO0FBQUEsTUFDTixDQUFLO0FBQUEsSUFDSDtBQUFBLEVBQ0Y7QUFlTyxXQUFTLGFBQWEsT0FBTztBQUNsQyxXQUFPLHFCQUFxQixPQUFPLE9BQU8sRUFBUztBQUFBLEVBQ3JEO0FDMVJBLE1BQUlJLGNBQVksT0FBTztBQUN2QixNQUFJQyxvQkFBa0IsQ0FBQyxLQUFLLEtBQUssVUFBVSxPQUFPLE1BQU1ELFlBQVUsS0FBSyxLQUFLLEVBQUUsWUFBWSxNQUFNLGNBQWMsTUFBTSxVQUFVLE1BQU0sTUFBSyxDQUFFLElBQUksSUFBSSxHQUFHLElBQUk7QUFDMUosTUFBSUUsa0JBQWdCLENBQUMsS0FBSyxLQUFLLFVBQVVELGtCQUFnQixLQUFLLE9BQU8sUUFBUSxXQUFXLE1BQU0sS0FBSyxLQUFLLEtBQUs7QUFDN0csTUFBSSxJQUFJO0FBRVIsUUFBTSxvQkFBb0IsT0FBTyxJQUFJLGFBQWE7QUFBQSxFQUMzQyxNQUFNLHFCQUFxQixLQUFLLE9BQU8sS0FBSyxtQkFBbUIsSUFBSTtBQUFBLElBQ3hFLFlBQVksTUFBTTtBQUNoQixZQUFNLE9BQU8sU0FBUyxXQUFXLE9BQU8sdUJBQXVCLElBQUksQ0FBQztBQUNwRUMsc0JBQWMsTUFBTSxRQUFRLGFBQWE7QUFDekNBLHNCQUFjLE1BQU0sTUFBTTtBQUMxQkEsc0JBQWMsTUFBTSxJQUFJLElBQUk7QUFDNUIsV0FBSyxPQUFPO0FBQUEsSUFDZDtBQUFBLEVBQ0Y7QUNtQkEsUUFBTSxNQUFNLE1BQU0sTUFBTSxLQUFLLEVBQUUsUUFBUSxFQUFDLEdBQUksTUFBTSxDQUFDO0FBQ3BDLE1BQUc7QUFDSCxNQUFHO0FDbkNsQixNQUFJRixjQUFZLE9BQU87QUFDdkIsTUFBSUMsb0JBQWtCLENBQUMsS0FBSyxLQUFLLFVBQVUsT0FBTyxNQUFNRCxZQUFVLEtBQUssS0FBSyxFQUFFLFlBQVksTUFBTSxjQUFjLE1BQU0sVUFBVSxNQUFNLE1BQUssQ0FBRSxJQUFJLElBQUksR0FBRyxJQUFJO0FBQzFKLE1BQUlFLGtCQUFnQixDQUFDLEtBQUssS0FBSyxVQUFVRCxrQkFBZ0IsS0FBSyxPQUFPLFFBQVEsV0FBVyxNQUFNLEtBQUssS0FBSyxLQUFLO0FBQzdHLFFBQU0sYUFBYTtBQUNuQixXQUFTLGtCQUFrQixRQUFRO0FBQ2pDLFlBQVEsUUFBTTtBQUFBLE1BQ1osS0FBSztBQUNILGVBQU87QUFBQSxNQUNULEtBQUs7QUFDSCxlQUFPO0FBQUEsTUFDVCxLQUFLO0FBQ0gsZUFBTztBQUFBLE1BQ1QsS0FBSztBQUNILGVBQU87QUFBQSxJQUNiO0FBQUEsRUFDQTtBQUFBLEVBQ08sTUFBTSxjQUFjO0FBQUEsSUFDekIsWUFBWSxTQUFTO0FBQ25CQyxzQkFBYyxNQUFNLGlCQUFpQjtBQUNyQ0Esc0JBQWMsTUFBTSxVQUFVO0FBQzlCLFdBQUssa0JBQWtCLENBQUE7QUFDdkIsV0FBSyxXQUFXLFFBQVE7QUFBQSxJQUMxQjtBQUFBLElBQ0EsbUJBQW1CLE1BQU07QUFDdkIsVUFBSSxLQUFLLEtBQUssU0FBUyxTQUFTLEVBQUUsRUFBRSxVQUFVLEdBQUcsRUFBRTtBQUNuRCxlQUFTTixLQUFJLEdBQUdBLEtBQUksSUFBSUEsTUFBSztBQUMzQixZQUFJLEtBQUssZ0JBQWdCLEVBQUUsTUFBTSxRQUFRO0FBQ3ZDO0FBQUEsUUFDRjtBQUNBLGFBQUssS0FBSyxTQUFTLFNBQVMsRUFBRSxFQUFFLFVBQVUsR0FBRyxFQUFFO0FBQUEsTUFDakQ7QUFDQSxXQUFLLGdCQUFnQixFQUFFLElBQUk7QUFDM0IsYUFBTyxNQUFNO0FBQ1gsZUFBTyxLQUFLLGdCQUFnQixFQUFFO0FBQUEsTUFDaEM7QUFBQSxJQUNGO0FBQUEsSUFDQSxjQUFjLE1BQU07QUFDbEIsVUFBSSxLQUFLLFVBQVU7QUFDakIsbUJBQVcsUUFBUSxPQUFPLE9BQU8sS0FBSyxlQUFlLEdBQUc7QUFDdEQsZUFBSyxTQUFTLElBQW9CLG9CQUFJLEtBQUksR0FBSSxZQUFXLENBQUUsSUFBSSxHQUFHLElBQUk7QUFBQSxRQUN4RTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxPQUFPLE1BQU07QUFDWCxpQkFBVyxRQUFRLE9BQU8sT0FBTyxLQUFLLGVBQWUsR0FBRztBQUN0RCxhQUFLLFFBQVEsR0FBRyxJQUFJO0FBQUEsTUFDdEI7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRLE1BQU07QUFDWixpQkFBVyxRQUFRLE9BQU8sT0FBTyxLQUFLLGVBQWUsR0FBRztBQUN0RCxhQUFLLFFBQVEsR0FBRyxJQUFJO0FBQUEsTUFDdEI7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTLE1BQU07QUFDYixpQkFBVyxRQUFRLE9BQU8sT0FBTyxLQUFLLGVBQWUsR0FBRztBQUN0RCxhQUFLLFNBQVMsR0FBRyxJQUFJO0FBQUEsTUFDdkI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNPLFdBQVMseUJBQXlCLFNBQVM7QUFDaEQsVUFBTU8sVUFBUyxJQUFJLGNBQWMsT0FBTztBQUN4QyxJQUFBQSxRQUFPLG1CQUFtQixDQUFDLFVBQVUsU0FBUztBQUM1QyxjQUFRLE9BQUs7QUFBQSxRQUNYLEtBQUs7QUFDSCxrQkFBUSxNQUFNLEdBQUcsSUFBSTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGtCQUFRLElBQUksR0FBRyxJQUFJO0FBQ25CO0FBQUEsUUFDRixLQUFLO0FBQ0gsa0JBQVEsS0FBSyxHQUFHLElBQUk7QUFDcEI7QUFBQSxRQUNGLEtBQUs7QUFDSCxrQkFBUSxNQUFNLEdBQUcsSUFBSTtBQUNyQjtBQUFBLFFBQ0YsU0FBUztBQUVQLGtCQUFRLElBQUksR0FBRyxJQUFJO0FBQUEsUUFDckI7QUFBQSxNQUNOO0FBQUEsSUFDRSxDQUFDO0FBQ0QsV0FBT0E7QUFBQSxFQUNUO0FBQ08sV0FBUyxzQkFBc0IsU0FBUztBQUM3QyxXQUFPLElBQUksY0FBYyxPQUFPO0FBQUEsRUFDbEM7QUFDTyxXQUFTLGVBQWVBLFNBQVEsTUFBTSxRQUFRLFNBQVMsU0FBUztBQUNyRSxVQUFNLFNBQVMsa0JBQWtCLE1BQU07QUFDdkMsUUFBSSxPQUFPLFlBQVksVUFBVTtBQUMvQixnQkFBVSxlQUFlLEtBQUssVUFBVSxRQUFRLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFBQSxJQUNyRTtBQUNxQjtBQUNuQixZQUFNLFFBQVEsUUFBUSxNQUFNLFdBQVc7QUFDdkMsVUFBSSxVQUFVLE1BQU07QUFDbEIsUUFBQUEsUUFBTztBQUFBLFVBQ0wsV0FBVyxNQUFNLElBQUksT0FBTztBQUFBLFFBQ3BDO0FBQ007QUFBQSxNQUNGO0FBQ0EsWUFBTSxRQUFRLFFBQVEsTUFBTSxHQUFHLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUNsRCxZQUFNLE9BQU8sUUFBUSxNQUFNLE1BQU0sQ0FBQyxFQUFFLE1BQU07QUFDMUMsTUFBQUEsUUFBTyxJQUFJLGFBQWEsTUFBTSxJQUFJLE9BQU8sT0FBTyxLQUFLLEtBQUssWUFBWSxJQUFJO0FBQUEsSUFDNUU7QUFBQSxFQUdGO0FDekdPLFFBQU0sZUFBZSxPQUFPLElBQUksY0FBYztBQ0M5QyxRQUFNLGtCQUFrQixPQUFPLElBQUksaUJBQWlCO0FBSXBELFdBQVMscUJBQXFCLFdBQVc7QUFDOUMsV0FBTyxVQUFVLGVBQWUsS0FBSztBQUFBLEVBQ3ZDO0FBQ08sV0FBUyxpQkFBaUIsR0FBRztBQUNsQyxXQUFPLEVBQUUsV0FBVyxhQUFhO0FBQUEsRUFDbkM7QUFDTyxXQUFTLG1CQUFtQixtQkFBbUI7QUFDcEQsUUFBSTtBQUNKLFFBQUksT0FBTyxzQkFBc0IsVUFBVTtBQUN6QyxVQUFJLGlCQUFpQixpQkFBaUIsR0FBRztBQUN2QywwQkFBa0IsRUFBRSxnQkFBZ0Isa0JBQWlCO0FBQUEsTUFDdkQsT0FBTztBQUNMLDBCQUFrQixFQUFFLE1BQU0sa0JBQWlCO0FBQUEsTUFDN0M7QUFBQSxJQUNGLFdBQVcsa0JBQWtCLFlBQVksR0FBRztBQUMxQyx3QkFBa0IsRUFBRSxNQUFNLGtCQUFrQixZQUFZLEVBQUM7QUFBQSxJQUMzRCxPQUFPO0FBQ0wsWUFBTSxnQkFBZ0IscUJBQXFCLGlCQUFpQjtBQUM1RCxVQUFJLENBQUMsZUFBZTtBQUNsQixjQUFNLElBQUksTUFBTSxHQUFHLGlCQUFpQiw2QkFBNkI7QUFBQSxNQUNuRTtBQUNBLHdCQUFrQixFQUFFLFdBQVcsY0FBYTtBQUFBLElBQzlDO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUMzQk8sV0FBUyxnQkFBZ0IsbUJBQW1CO0FBQ2pELFVBQU0sVUFBVSxtQkFBbUIsaUJBQWlCO0FBQ3BELFFBQUksUUFBUSxTQUFTLFFBQVE7QUFDM0IsVUFBSSxRQUFRLG1CQUFtQixRQUFRO0FBQ3JDLGNBQU0sSUFBSTtBQUFBLFVBQ1IsMEdBQTBHLFFBQVEsY0FBYztBQUFBLFFBQ3hJO0FBQUEsTUFDSSxXQUFXLFFBQVEsY0FBYyxRQUFRO0FBQ3ZDLGNBQU0sSUFBSTtBQUFBLFVBQ1IsNkhBQTZILFFBQVEsU0FBUztBQUFBLFFBQ3RKO0FBQUEsTUFDSTtBQUNBLFlBQU0sSUFBSTtBQUFBLFFBQ1IsMEZBQTBGLEtBQUssVUFBVSxPQUFPLENBQUM7QUFBQSxNQUN2SDtBQUFBLElBQ0U7QUFDQSxRQUFJLE9BQU8sc0JBQXNCLFNBQVUsUUFBTztBQUNsRCxVQUFNLE9BQU8sa0JBQWtCLFlBQVk7QUFDM0MsUUFBSSxDQUFDLE1BQU07QUFDVCxZQUFNLElBQUksTUFBTSxHQUFHLGlCQUFpQiw2QkFBNkI7QUFBQSxJQUNuRTtBQUNBLFdBQU87QUFBQSxFQUNUO0FBSUEsV0FBUyxVQUFVLFlBQVksSUFBSTtBQUNqQyxVQUFNLFVBQVU7QUFBQSxNQUNkLElBQUksR0FBRyxNQUFNO0FBQ1gsWUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM1QixnQkFBTSxXQUFXLENBQUMsR0FBRyxXQUFXLElBQUk7QUFDcEMsaUJBQU8sVUFBVSxRQUFRO0FBQUEsUUFDM0IsV0FBVyxTQUFTLGNBQWM7QUFDaEMsY0FBSSxVQUFVLFNBQVMsR0FBRztBQUN4QixrQkFBTSxRQUFRLENBQUMsT0FBTyxHQUFHLFNBQVMsRUFBRSxLQUFLLEdBQUc7QUFDNUMsa0JBQU0sSUFBSTtBQUFBLGNBQ1Isb0ZBQW9GLEtBQUs7QUFBQSxZQUNyRztBQUFBLFVBQ1E7QUFDQSxnQkFBTSxPQUFPLFVBQVUsTUFBTSxHQUFHLEVBQUUsRUFBRSxLQUFLLEdBQUc7QUFDNUMsZ0JBQU0sYUFBYSxVQUFVLFVBQVUsU0FBUyxDQUFDO0FBQ2pELGNBQUksZUFBZSxXQUFXO0FBQzVCLG1CQUFPO0FBQUEsVUFDVCxPQUFPO0FBQ0wsbUJBQU8sT0FBTyxNQUFNO0FBQUEsVUFDdEI7QUFBQSxRQUNGLFdBQVcsU0FBUyxPQUFPLGFBQWE7QUFDdEMsaUJBQU87QUFBQSxRQUNULE9BQU87QUFDTCxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBQUEsSUFDSjtBQUNFLFdBQU8sSUFBSSxNQUFNLENBQUEsR0FBSSxPQUFPO0FBQUEsRUFDOUI7QUF5Qk8sUUFBTSxTQUFTLFVBQVM7QUNqRi9CLE1BQUksWUFBWSxPQUFPO0FBQ3ZCLE1BQUksa0JBQWtCLENBQUMsS0FBSyxLQUFLLFVBQVUsT0FBTyxNQUFNLFVBQVUsS0FBSyxLQUFLLEVBQUUsWUFBWSxNQUFNLGNBQWMsTUFBTSxVQUFVLE1BQU0sTUFBSyxDQUFFLElBQUksSUFBSSxHQUFHLElBQUk7QUFDMUosTUFBSSxnQkFBZ0IsQ0FBQyxLQUFLLEtBQUssVUFBVSxnQkFBZ0IsS0FBSyxPQUFPLFFBQVEsV0FBVyxNQUFNLEtBQUssS0FBSyxLQUFLO0FBa0J0RyxRQUFNLHlCQUF5QjtBQUN0QyxNQUFJLGlCQUFpQjtBQUFBLEVBSWQsTUFBTSxpQkFBaUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBb0I1QixZQUFZLFNBQVMsU0FBUztBQUM1QixvQkFBYyxNQUFNLFNBQVM7QUFDN0Isb0JBQWMsTUFBTSxNQUFNO0FBQzFCLG9CQUFjLE1BQU0sV0FBVztBQUMvQixvQkFBYyxNQUFNLGtCQUFrQjtBQUN0QyxvQkFBYyxNQUFNLE9BQU87QUFDM0Isb0JBQWMsTUFBTSxjQUFjO0FBQ2xDLG9CQUFjLE1BQU0sT0FBTztBQUMzQixvQkFBYyxNQUFNLFFBQVE7QUFDNUIsb0JBQWMsTUFBTSxpQkFBaUIsRUFBRTtBQUN2QyxvQkFBYyxNQUFNLHFCQUFxQixLQUFLO0FBQzlDLFVBQUksT0FBTyxZQUFZLFdBQVc7QUFDaEMsY0FBTSxJQUFJO0FBQUEsVUFDUjtBQUFBLFFBQ1I7QUFBQSxNQUNJO0FBQ0EsWUFBTSxPQUFPLFdBQVcsQ0FBQTtBQUN4QixVQUFJLEtBQUssaUNBQWlDLE1BQU07QUFDOUMsOEJBQXNCLE9BQU87QUFBQSxNQUMvQjtBQUNBLFdBQUssU0FBUyxTQUFTLFdBQVcsUUFBUSxzQkFBc0IsRUFBRSxTQUFTLE1BQUssQ0FBRSxJQUFJLFNBQVMsV0FBVyxRQUFRLFNBQVMsU0FBUyxRQUFRLFNBQVMseUJBQXlCLEVBQUUsU0FBUyxPQUFPO0FBQ2hNLFdBQUssVUFBVTtBQUNmLFdBQUssUUFBUTtBQUNiLFdBQUssT0FBTztBQUNaLFdBQUssWUFBWTtBQUNqQixXQUFLLFFBQVEsU0FBUztBQUN0QixVQUFJLFNBQVMsTUFBTTtBQUNqQixhQUFLLFFBQVEsUUFBUSxJQUFJO0FBQUEsTUFDM0I7QUFBQSxJQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFPQSxhQUFhO0FBQ1gsYUFBTyxHQUFHLEtBQUssT0FBTztBQUFBLElBQ3hCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFPQSxJQUFJLE1BQU07QUFDUixhQUFPLEtBQUs7QUFBQSxJQUNkO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQVFBLFFBQVEsT0FBTztBQUNiLFdBQUssVUFBUztBQUNkLFdBQUssT0FBTztBQUFBLElBQ2Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9BLGFBQWEsT0FBTyxrQkFBa0I7QUFDcEMsV0FBSyxVQUFTO0FBQ2QsVUFBSSxxQkFBcUIsUUFBUTtBQUMvQixjQUFNLFFBQVEsSUFBSSxZQUFXLEVBQUcsT0FBTyxLQUFLLFVBQVUsZ0JBQWdCLENBQUM7QUFDdkUsY0FBTSwwQkFBMEIsS0FBSyxPQUFPLGNBQWMsR0FBRyxLQUFLLENBQUM7QUFDbkUsYUFBSyxZQUFZLEdBQUcsS0FBSyxJQUFJLHVCQUF1QjtBQUFBLE1BQ3RELE9BQU87QUFDTCxhQUFLLFlBQVk7QUFBQSxNQUNuQjtBQUFBLElBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUlBLFlBQVk7QUFDVixXQUFLLE9BQU87QUFDWixXQUFLLFlBQVk7QUFBQSxJQUNuQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU1BLFNBQVMsT0FBTztBQUNkLFdBQUssUUFBUTtBQUFBLElBQ2Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFNQSxnQkFBZ0IsY0FBYztBQUM1QixXQUFLLGVBQWU7QUFBQSxJQUN0QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFvQkEsTUFBTSxnQkFBZ0IsVUFBVSxNQUFNO0FBQ3BDLFlBQU0sWUFBWSxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQ25DLFlBQU0sbUJBQW1CLEtBQUssYUFBWTtBQUMxQyxhQUFPLE1BQU0sS0FBSyxXQUFXLE9BQU8sV0FBVyxFQUFFLGtCQUFrQjtBQUFBLElBQ3JFO0FBQUEsSUFDQSxNQUFNLGVBQWU7QUFDbkIsVUFBSSxLQUFLLGtCQUFrQjtBQUN6QixlQUFPLEtBQUs7QUFBQSxNQUNkO0FBQ0EsYUFBTyxLQUFLLG1CQUFtQixLQUFLLGtCQUFpQjtBQUFBLElBQ3ZEO0FBQUEsSUFDQSxNQUFNLG9CQUFvQjtBQUN4QixZQUFNLGFBQWEsS0FBSyxTQUFTLGtCQUFrQjtBQUNuRCxZQUFNLFVBQVU7QUFBQSxRQUNkLGdCQUFnQjtBQUFBLFFBQ2hCLGlCQUFpQixPQUFPLE9BQU87QUFBQSxNQUNyQztBQUNJLFlBQU0sV0FBVyxNQUFNLFdBQVcsR0FBRyxLQUFLLE9BQU8saUJBQWlCO0FBQUEsUUFDaEUsR0FBRyxLQUFLO0FBQUEsUUFDUixRQUFRO0FBQUEsUUFDUjtBQUFBLE1BQ04sQ0FBSztBQUNELFVBQUksQ0FBQyxTQUFTLElBQUk7QUFDaEIsY0FBTSxJQUFJLE1BQU0sTUFBTSxTQUFTLEtBQUksQ0FBRTtBQUFBLE1BQ3ZDO0FBQ0EsWUFBTSxFQUFFLEdBQUUsSUFBSyxNQUFNLFNBQVMsS0FBSTtBQUNsQyxhQUFPO0FBQUEsSUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQVNBLE1BQU0sTUFBTSxVQUFVLE1BQU07QUFDMUIsWUFBTSxZQUFZLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFDbkMsYUFBTyxNQUFNLEtBQUssV0FBVyxPQUFPLFdBQVcsQ0FBQSxDQUFFO0FBQUEsSUFDbkQ7QUFBQSxJQUNBLE1BQU0sV0FBVyxPQUFPLFdBQVcsU0FBUztBQUMxQyxZQUFNLE9BQU8sZ0JBQWdCLEtBQUs7QUFDbEMsWUFBTSxPQUFPLENBQUMsYUFBYSxTQUFTLENBQUM7QUFDckMsWUFBTSxVQUFVO0FBQUEsUUFDZCxnQkFBZ0I7QUFBQSxRQUNoQixpQkFBaUIsT0FBTyxPQUFPO0FBQUEsTUFDckM7QUFDSSxVQUFJLEtBQUssV0FBVztBQUNsQixnQkFBUSxlQUFlLElBQUksVUFBVSxLQUFLLFNBQVM7QUFBQSxNQUNyRCxXQUFXLEtBQUssTUFBTTtBQUNwQixnQkFBUSxlQUFlLElBQUksVUFBVSxLQUFLLElBQUk7QUFBQSxNQUNoRDtBQUNBLFlBQU0sYUFBYSxLQUFLLFNBQVMsa0JBQWtCO0FBQ25ELFlBQU0sWUFBWSxRQUFRLG1CQUFtQixNQUFNLFFBQVEsbUJBQW1CO0FBQzlFLFlBQU0sT0FBTyxLQUFLLFVBQVU7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUjtBQUFBLFFBQ0EsR0FBRyxZQUFZLEVBQUUsSUFBSSxjQUFjLENBQUE7QUFBQSxNQUN6QyxDQUFLO0FBQ0QsWUFBTSxXQUFXLFlBQVksR0FBRyxLQUFLLE9BQU8scUJBQXFCLEdBQUcsS0FBSyxPQUFPO0FBQ2hGLFlBQU0sV0FBVyxNQUFNLFdBQVcsVUFBVTtBQUFBLFFBQzFDLEdBQUcsS0FBSztBQUFBLFFBQ1I7QUFBQSxRQUNBLFFBQVE7QUFBQSxRQUNSO0FBQUEsTUFDTixDQUFLO0FBQ0QsVUFBSSxDQUFDLFNBQVMsTUFBTSxTQUFTLFdBQVcsd0JBQXdCO0FBQzlELGNBQU0sSUFBSSxNQUFNLE1BQU0sU0FBUyxLQUFJLENBQUU7QUFBQSxNQUN2QztBQUNBLFlBQU0sV0FBVyxNQUFNLFNBQVMsS0FBSTtBQUNwQyxVQUFJLEtBQUssT0FBTztBQUNkLG1CQUFXLFFBQVEsU0FBUyxZQUFZLENBQUEsR0FBSTtBQUMxQyx5QkFBZSxLQUFLLFFBQVEsUUFBUSxTQUFTLE1BQU0sSUFBSTtBQUFBLFFBQ3pEO0FBQUEsTUFDRjtBQUNBLGNBQVEsU0FBUyxRQUFNO0FBQUEsUUFDckIsS0FBSztBQUNILGlCQUFPLGFBQWEsU0FBUyxLQUFLO0FBQUEsUUFDcEMsS0FBSztBQUNILGNBQUksU0FBUyxjQUFjLFFBQVE7QUFDakMsa0JBQU07QUFBQSxjQUNKLFNBQVM7QUFBQSxjQUNULElBQUksWUFBWSxTQUFTLFlBQVk7QUFBQSxZQUNqRDtBQUFBLFVBQ1E7QUFDQSxnQkFBTSxJQUFJLE1BQU0sU0FBUyxZQUFZO0FBQUEsUUFDdkM7QUFDRSxnQkFBTSxJQUFJLE1BQU0scUJBQXFCLEtBQUssVUFBVSxRQUFRLENBQUMsRUFBRTtBQUFBLE1BQ3ZFO0FBQUEsSUFDRTtBQUFBLElBQ0EsTUFBTSxjQUFjLFVBQVUsY0FBYztBQUMxQyxZQUFNLE9BQU8sZ0JBQWdCLFFBQVE7QUFDckMsWUFBTSxPQUFPLEtBQUssVUFBVTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLE1BQU0sQ0FBQyxhQUFhLFlBQVksQ0FBQztBQUFBLE1BQ3ZDLENBQUs7QUFDRCxZQUFNLFVBQVU7QUFBQSxRQUNkLGdCQUFnQjtBQUFBLFFBQ2hCLGlCQUFpQixPQUFPLE9BQU87QUFBQSxNQUNyQztBQUNJLFVBQUksS0FBSyxXQUFXO0FBQ2xCLGdCQUFRLGVBQWUsSUFBSSxVQUFVLEtBQUssU0FBUztBQUFBLE1BQ3JELFdBQVcsS0FBSyxNQUFNO0FBQ3BCLGdCQUFRLGVBQWUsSUFBSSxVQUFVLEtBQUssSUFBSTtBQUFBLE1BQ2hEO0FBQ0EsWUFBTSxhQUFhLEtBQUssU0FBUyxrQkFBa0I7QUFDbkQsWUFBTSxXQUFXLE1BQU0sV0FBVyxHQUFHLEtBQUssT0FBTyxpQkFBaUI7QUFBQSxRQUNoRSxHQUFHLEtBQUs7QUFBQSxRQUNSO0FBQUEsUUFDQSxRQUFRO0FBQUEsUUFDUjtBQUFBLE1BQ04sQ0FBSztBQUNELFVBQUksQ0FBQyxTQUFTLE1BQU0sU0FBUyxXQUFXLHdCQUF3QjtBQUM5RCxjQUFNLElBQUksTUFBTSxNQUFNLFNBQVMsS0FBSSxDQUFFO0FBQUEsTUFDdkM7QUFDQSxZQUFNLFdBQVcsTUFBTSxTQUFTLEtBQUk7QUFDcEMsVUFBSSxLQUFLLE9BQU87QUFDZCxtQkFBVyxRQUFRLFNBQVMsWUFBWSxDQUFBLEdBQUk7QUFDMUMseUJBQWUsS0FBSyxRQUFRLFFBQVEsWUFBWSxNQUFNLElBQUk7QUFBQSxRQUM1RDtBQUFBLE1BQ0Y7QUFDQSxjQUFRLFNBQVMsUUFBTTtBQUFBLFFBQ3JCLEtBQUs7QUFDSCxpQkFBTyxhQUFhLFNBQVMsS0FBSztBQUFBLFFBQ3BDLEtBQUs7QUFDSCxjQUFJLFNBQVMsY0FBYyxRQUFRO0FBQ2pDLGtCQUFNO0FBQUEsY0FDSixTQUFTO0FBQUEsY0FDVCxJQUFJLFlBQVksU0FBUyxZQUFZO0FBQUEsWUFDakQ7QUFBQSxVQUNRO0FBQ0EsZ0JBQU0sSUFBSSxNQUFNLFNBQVMsWUFBWTtBQUFBLFFBQ3ZDO0FBQ0UsZ0JBQU0sSUFBSSxNQUFNLHFCQUFxQixLQUFLLFVBQVUsUUFBUSxDQUFDLEVBQUU7QUFBQSxNQUN2RTtBQUFBLElBQ0U7QUFBQSxJQUNBLE1BQU0sdUJBQXVCO0FBQzNCLFVBQUksS0FBSyxtQkFBbUI7QUFDMUI7QUFBQSxNQUNGO0FBQ0EsV0FBSyxvQkFBb0I7QUFDekIsYUFBTyxLQUFLLGNBQWMsU0FBUyxHQUFHO0FBQ3BDLGNBQU0sRUFBRSxVQUFVLE1BQU0sU0FBUyxPQUFNLElBQUssS0FBSyxjQUFjLE1BQUs7QUFDcEUsWUFBSTtBQUNGLGdCQUFNQyxVQUFTLE1BQU0sS0FBSyxjQUFjLFVBQVUsSUFBSTtBQUN0RCxrQkFBUUEsT0FBTTtBQUFBLFFBQ2hCLFNBQVMsT0FBTztBQUNkLGlCQUFPLEtBQUs7QUFBQSxRQUNkO0FBQUEsTUFDRjtBQUNBLFdBQUssb0JBQW9CO0FBQUEsSUFDM0I7QUFBQSxJQUNBLGdCQUFnQixVQUFVLE1BQU07QUFDOUIsYUFBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdEMsYUFBSyxjQUFjLEtBQUssRUFBRSxVQUFVLE1BQU0sU0FBUyxRQUFRO0FBQzNELGFBQUssS0FBSyxxQkFBb0I7QUFBQSxNQUNoQyxDQUFDO0FBQUEsSUFDSDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBVUEsTUFBTSxTQUFTLGFBQWEsTUFBTTtBQUNoQyxZQUFNLENBQUMsUUFBUSxPQUFPLElBQUk7QUFDMUIsWUFBTSxlQUFlLFVBQVUsTUFBTTtBQUNyQyxZQUFNLFNBQVMsQ0FBQyxTQUFTO0FBQ3pCLFVBQUksUUFBUTtBQUNWLGVBQU8sTUFBTSxLQUFLLGdCQUFnQixVQUFVLFlBQVk7QUFBQSxNQUMxRCxPQUFPO0FBQ0wsZUFBTyxNQUFNLEtBQUssY0FBYyxVQUFVLFlBQVk7QUFBQSxNQUN4RDtBQUFBLElBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFTQSxNQUFNLE9BQU8sV0FBVyxNQUFNO0FBQzVCLFlBQU0sYUFBYSxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQ3BDLFlBQU0sT0FBTyxnQkFBZ0IsTUFBTTtBQUNuQyxZQUFNLE9BQU8sS0FBSyxVQUFVO0FBQUEsUUFDMUIsTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsTUFBTSxDQUFDLGFBQWEsVUFBVSxDQUFDO0FBQUEsTUFDckMsQ0FBSztBQUNELFlBQU0sVUFBVTtBQUFBLFFBQ2QsZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCLE9BQU8sT0FBTztBQUFBLE1BQ3JDO0FBQ0ksVUFBSSxLQUFLLFdBQVc7QUFDbEIsZ0JBQVEsZUFBZSxJQUFJLFVBQVUsS0FBSyxTQUFTO0FBQUEsTUFDckQsV0FBVyxLQUFLLE1BQU07QUFDcEIsZ0JBQVEsZUFBZSxJQUFJLFVBQVUsS0FBSyxJQUFJO0FBQUEsTUFDaEQ7QUFDQSxZQUFNLGFBQWEsS0FBSyxTQUFTLGtCQUFrQjtBQUNuRCxZQUFNLFdBQVcsTUFBTSxXQUFXLEdBQUcsS0FBSyxPQUFPLGVBQWU7QUFBQSxRQUM5RCxHQUFHLEtBQUs7QUFBQSxRQUNSO0FBQUEsUUFDQSxRQUFRO0FBQUEsUUFDUjtBQUFBLE1BQ04sQ0FBSztBQUNELFVBQUksQ0FBQyxTQUFTLE1BQU0sU0FBUyxXQUFXLHdCQUF3QjtBQUM5RCxjQUFNLElBQUksTUFBTSxNQUFNLFNBQVMsS0FBSSxDQUFFO0FBQUEsTUFDdkM7QUFDQSxZQUFNLFdBQVcsTUFBTSxTQUFTLEtBQUk7QUFDcEMsVUFBSSxLQUFLLE9BQU87QUFDZCxtQkFBVyxRQUFRLFNBQVMsWUFBWSxDQUFBLEdBQUk7QUFDMUMseUJBQWUsS0FBSyxRQUFRLFFBQVEsVUFBVSxNQUFNLElBQUk7QUFBQSxRQUMxRDtBQUFBLE1BQ0Y7QUFDQSxjQUFRLFNBQVMsUUFBTTtBQUFBLFFBQ3JCLEtBQUs7QUFDSCxpQkFBTyxhQUFhLFNBQVMsS0FBSztBQUFBLFFBQ3BDLEtBQUs7QUFDSCxjQUFJLFNBQVMsY0FBYyxRQUFRO0FBQ2pDLGtCQUFNO0FBQUEsY0FDSixTQUFTO0FBQUEsY0FDVCxJQUFJLFlBQVksU0FBUyxZQUFZO0FBQUEsWUFDakQ7QUFBQSxVQUNRO0FBQ0EsZ0JBQU0sSUFBSSxNQUFNLFNBQVMsWUFBWTtBQUFBLFFBQ3ZDO0FBQ0UsZ0JBQU0sSUFBSSxNQUFNLHFCQUFxQixLQUFLLFVBQVUsUUFBUSxDQUFDLEVBQUU7QUFBQSxNQUN2RTtBQUFBLElBQ0U7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBV0EsTUFBTSxTQUFTLGFBQWEsa0JBQWtCLE1BQU07QUFDbEQsWUFBTSxlQUFlLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFDdEMsWUFBTSxPQUFPLE9BQU8sZ0JBQWdCLFdBQVcsY0FBYyxnQkFBZ0IsV0FBVztBQUN4RixZQUFNLE9BQU8sS0FBSyxVQUFVO0FBQUEsUUFDMUI7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLE1BQU0sYUFBYSxZQUFZO0FBQUEsTUFDckMsQ0FBSztBQUNELFlBQU0sVUFBVTtBQUFBLFFBQ2QsZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCLE9BQU8sT0FBTztBQUFBLE1BQ3JDO0FBQ0ksVUFBSSxLQUFLLFdBQVc7QUFDbEIsZ0JBQVEsZUFBZSxJQUFJLFVBQVUsS0FBSyxTQUFTO0FBQUEsTUFDckQsV0FBVyxLQUFLLE1BQU07QUFDcEIsZ0JBQVEsZUFBZSxJQUFJLFVBQVUsS0FBSyxJQUFJO0FBQUEsTUFDaEQ7QUFDQSxZQUFNLGFBQWEsS0FBSyxTQUFTLGtCQUFrQjtBQUNuRCxZQUFNLFdBQVcsTUFBTSxXQUFXLEdBQUcsS0FBSyxPQUFPLGlCQUFpQjtBQUFBLFFBQ2hFLEdBQUcsS0FBSztBQUFBLFFBQ1I7QUFBQSxRQUNBLFFBQVE7QUFBQSxRQUNSO0FBQUEsTUFDTixDQUFLO0FBQ0QsVUFBSSxDQUFDLFNBQVMsTUFBTSxTQUFTLFdBQVcsd0JBQXdCO0FBQzlELGNBQU0sSUFBSSxNQUFNLE1BQU0sU0FBUyxLQUFJLENBQUU7QUFBQSxNQUN2QztBQUNBLFlBQU0sV0FBVyxNQUFNLFNBQVMsS0FBSTtBQUNwQyxVQUFJLEtBQUssT0FBTztBQUNkLG1CQUFXLFFBQVEsU0FBUyxZQUFZLENBQUEsR0FBSTtBQUMxQyx5QkFBZSxLQUFLLFFBQVEsUUFBUSxPQUFPLE1BQU0sSUFBSTtBQUFBLFFBQ3ZEO0FBQUEsTUFDRjtBQUNBLGNBQVEsU0FBUyxRQUFNO0FBQUEsUUFDckIsS0FBSztBQUNILGlCQUFPLGFBQWEsU0FBUyxLQUFLO0FBQUEsUUFDcEMsS0FBSztBQUNILGNBQUksU0FBUyxjQUFjLFFBQVE7QUFDakMsa0JBQU07QUFBQSxjQUNKLFNBQVM7QUFBQSxjQUNULElBQUksWUFBWSxTQUFTLFlBQVk7QUFBQSxZQUNqRDtBQUFBLFVBQ1E7QUFDQSxnQkFBTSxJQUFJLE1BQU0sU0FBUyxZQUFZO0FBQUEsUUFDdkM7QUFDRSxnQkFBTSxJQUFJLE1BQU0scUJBQXFCLEtBQUssVUFBVSxRQUFRLENBQUMsRUFBRTtBQUFBLE1BQ3ZFO0FBQUEsSUFDRTtBQUFBLEVBQ0Y7QUFDQSxXQUFTLGlCQUFpQixXQUFXLE9BQU87QUFDMUMsVUFBTSxPQUFPLGFBQWEsU0FBUztBQUNuQyxXQUFPO0FBQUEsRUFDVDtBQ3hSQSxXQUFTLHNCQUFzQixNQUFNLFdBQVc7QUFDOUMsVUFBTSxVQUFVO0FBQUEsTUFDZCxJQUFJLEdBQUcsTUFBTTtBQUNYLFlBQUksT0FBTyxTQUFTLFVBQVU7QUFDNUIsZ0JBQU0sV0FBVyxDQUFDLEdBQUcsV0FBVyxJQUFJO0FBQ3BDLGlCQUFPLHNCQUFzQixNQUFNLFFBQVE7QUFBQSxRQUM3QyxXQUFXLFNBQVMsaUJBQWlCO0FBQ25DLGNBQUksVUFBVSxTQUFTLEdBQUc7QUFDeEIsa0JBQU0sUUFBUSxDQUFDLE1BQU0sR0FBRyxTQUFTLEVBQUUsS0FBSyxHQUFHO0FBQzNDLGtCQUFNLElBQUk7QUFBQSxjQUNSLDRDQUE0QyxJQUFJLDRDQUE0QyxLQUFLO0FBQUEsWUFDN0c7QUFBQSxVQUNRO0FBQ0EsaUJBQU8sK0JBQStCLFVBQVUsS0FBSyxHQUFHO0FBQUEsUUFDMUQsT0FBTztBQUNMLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxJQUNKO0FBQ0UsV0FBTyxJQUFJLE1BQU0sQ0FBQSxHQUFJLE9BQU87QUFBQSxFQUM5QjtBQUNPLFFBQU0sb0JBQW9CLE1BQU0sc0JBQXNCLGNBQWMsRUFBRTtBQ3RMdEUsUUFBTSxNQUFNO0FBRU8sb0JBQWlCO0FDdEIzQyxRQUFNQyxnQkFBYztBQUVwQixXQUFTLGVBQXVCO0FBQzlCLFdBQU8sT0FBTyxXQUFBO0FBQUEsRUFDaEI7QUFFQSxpQkFBc0IsY0FBK0I7QUFDbkQsVUFBTUQsVUFBUyxNQUFNLE9BQU8sUUFBUSxNQUFNLElBQUlDLGFBQVc7QUFDekQsUUFBSUQsUUFBT0MsYUFBVyxHQUFHO0FBQ3ZCLGFBQU9ELFFBQU9DLGFBQVc7QUFBQSxJQUMzQjtBQUNBLFVBQU0sS0FBSyxhQUFBO0FBQ1gsVUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJLEVBQUUsQ0FBQ0EsYUFBVyxHQUFHLElBQUk7QUFDcEQsV0FBTztBQUFBLEVBQ1Q7QUNOQSxpQkFBZSxpQkFDYixLQUNBLE1BQ0EsWUFBWSxLQUNPO0FBQ25CLFVBQU0sYUFBYSxJQUFJLGdCQUFBO0FBQ3ZCLFVBQU0sWUFBWSxXQUFXLE1BQU0sV0FBVyxNQUFBLEdBQVMsU0FBUztBQUVoRSxRQUFJO0FBQ0YsWUFBTSxNQUFNLE1BQU0sTUFBTSxLQUFLLEVBQUUsR0FBRyxNQUFNLFFBQVEsV0FBVyxRQUFRO0FBQ25FLG1CQUFhLFNBQVM7QUFDdEIsYUFBTztBQUFBLElBQ1QsU0FBUyxHQUFHO0FBQ1YsbUJBQWEsU0FBUztBQUN0QixVQUFJLGFBQWEsZ0JBQWdCLEVBQUUsU0FBUyxjQUFjO0FBQ3hELGNBQU0sSUFBSSxNQUFNLG1CQUFtQjtBQUFBLE1BQ3JDO0FBQ0EsWUFBTTtBQUFBLElBQ1I7QUFBQSxFQUNGO0FBRUEsaUJBQWUsWUFBWSxNQUFjLE1BQStCO0FBQ3RFLFVBQU0sTUFBTSxJQUFJLElBQUkseUNBQXlDO0FBQzdELFFBQUksYUFBYSxJQUFJLEtBQUssSUFBSTtBQUM5QixRQUFJLGFBQWEsSUFBSSxZQUFZLE1BQU0sSUFBSSxFQUFFO0FBRTdDLFVBQU0sTUFBTSxNQUFNLGlCQUFpQixJQUFJLFlBQVksQ0FBQSxHQUFJLEdBQUk7QUFDM0QsUUFBSSxDQUFDLElBQUksR0FBSSxPQUFNLElBQUksTUFBTSxpQkFBaUIsSUFBSSxNQUFNLEVBQUU7QUFFMUQsVUFBTSxPQUF5QixNQUFNLElBQUksS0FBQTtBQUN6QyxRQUFJLEtBQUssbUJBQW1CLEtBQUs7QUFDL0IsWUFBTSxJQUFJLE1BQU0sdUJBQXVCLEtBQUssY0FBYyxFQUFFO0FBQUEsSUFDOUQ7QUFFQSxVQUFNLGNBQWMsS0FBSyxhQUFhO0FBR3RDLFFBQUksWUFBWSxjQUFjLEtBQUEsTUFBVyxLQUFLLFlBQUEsRUFBYyxRQUFRO0FBQ2xFLFlBQU0sSUFBSSxNQUFNLG1DQUFtQztBQUFBLElBQ3JEO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFFQSxpQkFBZSxrQkFDYixNQUNBLE1BQ2lCO0FBQ2pCLFVBQU0sTUFBTSxNQUFNO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsUUFDRSxRQUFRO0FBQUEsUUFDUixTQUFTLEVBQUUsZ0JBQWdCLG1CQUFBO0FBQUEsUUFDM0IsTUFBTSxLQUFLLFVBQVU7QUFBQSxVQUNuQixHQUFHO0FBQUEsVUFDSCxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsUUFBQSxDQUNUO0FBQUEsTUFBQTtBQUFBLE1BRUg7QUFBQSxJQUFBO0FBR0YsUUFBSSxDQUFDLElBQUksR0FBSSxPQUFNLElBQUksTUFBTSx1QkFBdUIsSUFBSSxNQUFNLEVBQUU7QUFFaEUsVUFBTSxPQUFRLE1BQU0sSUFBSSxLQUFBO0FBQ3hCLFFBQUksQ0FBQyxLQUFLLGdCQUFnQjtBQUN4QixZQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxJQUMxRDtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2Q7QUFFQSxpQkFBZSxtQkFDYixNQUNBLE1BQ2lCO0FBQ2pCLFVBQU0sTUFBTSxJQUFJLElBQUkscURBQXFEO0FBQ3pFLFFBQUksYUFBYSxJQUFJLFVBQVUsS0FBSztBQUNwQyxRQUFJLGFBQWEsSUFBSSxNQUFNLElBQUk7QUFDL0IsUUFBSSxhQUFhLElBQUksTUFBTSxJQUFJO0FBQy9CLFFBQUksYUFBYSxJQUFJLE1BQU0sR0FBRztBQUM5QixRQUFJLGFBQWEsSUFBSSxLQUFLLElBQUk7QUFFOUIsVUFBTSxNQUFNLE1BQU0saUJBQWlCLElBQUksWUFBWSxDQUFBLEdBQUksR0FBSTtBQUMzRCxRQUFJLENBQUMsSUFBSSxHQUFJLE9BQU0sSUFBSSxNQUFNLHlCQUF5QixJQUFJLE1BQU0sRUFBRTtBQUdsRSxVQUFNLE9BQU8sTUFBTSxJQUFJLEtBQUE7QUFDdkIsVUFBTSxjQUFjLE9BQU8sQ0FBQyxHQUN4QixJQUFJLENBQUMsWUFBc0IsUUFBUSxDQUFDLENBQUMsRUFDdEMsS0FBSyxFQUFFO0FBRVYsUUFBSSxDQUFDLGFBQWE7QUFDaEIsWUFBTSxJQUFJLE1BQU0sMENBQTBDO0FBQUEsSUFDNUQ7QUFFQSxRQUFJLFlBQVksY0FBYyxLQUFBLE1BQVcsS0FBSyxZQUFBLEVBQWMsUUFBUTtBQUNsRSxZQUFNLElBQUksTUFBTSwyQ0FBMkM7QUFBQSxJQUM3RDtBQUVBLFdBQU87QUFBQSxFQUNUO0FBRUEsaUJBQWUsZ0JBQWlDO0FBQzlDLFFBQUk7QUFDRixZQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVEsS0FBSyxJQUFJLFlBQVk7QUFDdkQsYUFBTyxLQUFLLGNBQWM7QUFBQSxJQUM1QixRQUFRO0FBQ04sYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBRUEsaUJBQXNCLGNBQ3BCLE1BQ0EsWUFDaUI7QUFDakIsVUFBTSxPQUFPLGNBQWMsTUFBTSxjQUFBO0FBRWpDLFFBQUk7QUFDRixhQUFPLE1BQU0sWUFBWSxNQUFNLElBQUk7QUFBQSxJQUNyQyxRQUFRO0FBQUEsSUFFUjtBQUdBLFFBQUk7QUFDRixhQUFPLE1BQU0sa0JBQWtCLE1BQU0sSUFBSTtBQUFBLElBQzNDLFFBQVE7QUFBQSxJQUVSO0FBR0EsUUFBSTtBQUNGLGFBQU8sTUFBTSxtQkFBbUIsTUFBTSxJQUFJO0FBQUEsSUFDNUMsUUFBUTtBQUFBLElBRVI7QUFFQSxVQUFNLElBQUksTUFBTSxpQ0FBaUM7QUFBQSxFQUNuRDtBQ25KQSxRQUFNLGNBQWM7QUFRcEIsUUFBTSxtQkFBbUI7QUFDekIsUUFBTSxrQkFBa0I7QUFFeEIsV0FBUyxXQUFtQjtBQUMxQixnQ0FBVyxRQUFPLGNBQWMsTUFBTSxHQUFHLEVBQUU7QUFBQSxFQUM3QztBQUVBLGlCQUFlLGNBQWdDO0FBQzdDLFVBQU0sT0FBTyxNQUFNLE9BQU8sUUFBUSxNQUFNLElBQUksV0FBVztBQUN2RCxXQUFPLEtBQUssV0FBVyxLQUFLLEVBQUUsT0FBTyxPQUFPLGNBQWMsR0FBRyxrQkFBa0IsV0FBUztBQUFBLEVBQzFGO0FBRUEsaUJBQWUsYUFBYSxNQUE4QjtBQUN4RCxVQUFNLE9BQU8sUUFBUSxNQUFNLElBQUksRUFBRSxDQUFDLFdBQVcsR0FBRyxNQUFNO0FBQUEsRUFDeEQ7QUFFQSxpQkFBc0IsZUFBa0U7QUFDdEYsVUFBTSxPQUFPLE1BQU0sWUFBQTtBQUVuQixRQUFJLEtBQUsscUJBQXFCLFlBQVk7QUFDeEMsV0FBSyxlQUFlO0FBQ3BCLFdBQUssbUJBQW1CLFNBQUE7QUFDeEIsWUFBTSxhQUFhLElBQUk7QUFBQSxJQUN6QjtBQUNBLFdBQU8sRUFBRSxPQUFPLEtBQUssT0FBTyxjQUFjLEtBQUssYUFBQTtBQUFBLEVBQ2pEO0FBRUEsaUJBQXNCLGdCQUFrRTtBQUN0RixVQUFNLEVBQUUsT0FBTyxhQUFBLElBQWlCLE1BQU0sYUFBQTtBQUN0QyxVQUFNLFFBQVEsUUFBUSxrQkFBa0I7QUFDeEMsVUFBTSxZQUFZLEtBQUssSUFBSSxHQUFHLFFBQVEsWUFBWTtBQUNsRCxXQUFPLEVBQUUsU0FBUyxZQUFZLEdBQUcsVUFBQTtBQUFBLEVBQ25DO0FBTUEsaUJBQXNCLG1CQUFxRTtBQUN6RixVQUFNLE9BQU8sTUFBTSxZQUFBO0FBQ25CLFFBQUksS0FBSyxxQkFBcUIsWUFBWTtBQUN4QyxXQUFLLGVBQWU7QUFDcEIsV0FBSyxtQkFBbUIsU0FBQTtBQUFBLElBQzFCO0FBQ0EsVUFBTSxRQUFRLEtBQUssUUFBUSxrQkFBa0I7QUFDN0MsUUFBSSxLQUFLLGdCQUFnQixPQUFPO0FBQzlCLGFBQU8sRUFBRSxTQUFTLE9BQU8sV0FBVyxFQUFBO0FBQUEsSUFDdEM7QUFDQSxTQUFLLGdCQUFnQjtBQUNyQixVQUFNLGFBQWEsSUFBSTtBQUN2QixXQUFPLEVBQUUsU0FBUyxNQUFNLFdBQVcsS0FBSyxJQUFJLEdBQUcsUUFBUSxLQUFLLFlBQVksRUFBQTtBQUFBLEVBQzFFO0FDcERBLFFBQUEsZUFBQTtBQUNBLFFBQUEsb0JBQUE7QUF3REEsV0FBQSxlQUFBLEtBQUE7QUFDRSxRQUFBLENBQUEsT0FBQSxPQUFBLFFBQUEsWUFBQSxFQUFBLFVBQUEsS0FBQSxRQUFBO0FBQ0EsVUFBQSxJQUFBO0FBQ0EsWUFBQSxFQUFBLE1BQUE7QUFBQSxNQUFnQixLQUFBO0FBRVosZUFBQSxPQUFBLEVBQUEsU0FBQTtBQUFBLE1BQXlCLEtBQUE7QUFFekIsZUFBQSxPQUFBLEVBQUEsU0FBQSxZQUFBLE9BQUEsRUFBQSxnQkFBQTtBQUFBLE1BQThELEtBQUE7QUFFOUQsZUFBQSxPQUFBLEVBQUEsV0FBQSxZQUFBLE9BQUEsRUFBQSxlQUFBO0FBQUEsTUFBK0QsS0FBQTtBQUUvRCxlQUFBO0FBQUEsTUFBTyxLQUFBO0FBRVAsZUFBQSxNQUFBLFFBQUEsRUFBQSxLQUFBO0FBQUEsTUFBNEIsS0FBQTtBQUU1QixlQUFBO0FBQUEsTUFBTyxLQUFBO0FBRVAsZUFBQSxPQUFBLEVBQUEsU0FBQSxZQUFBLE9BQUEsRUFBQSxhQUFBO0FBQUEsTUFBMkQsS0FBQTtBQUUzRCxlQUFBLE9BQUEsRUFBQSxTQUFBO0FBQUEsTUFBeUIsS0FBQTtBQUV6QixlQUFBO0FBQUEsTUFBTyxLQUFBO0FBRVAsZUFBQSxPQUFBLEVBQUEsVUFBQTtBQUFBLE1BQTBCLEtBQUE7QUFFMUIsZUFBQSxPQUFBLEVBQUEsV0FBQTtBQUFBLE1BQTJCLEtBQUE7QUFFM0IsZUFBQSxPQUFBLEVBQUEsV0FBQSxZQUFBLE9BQUEsRUFBQSxhQUFBLFlBQUEsT0FBQSxFQUFBLFFBQUE7QUFBQSxNQUEwRixLQUFBO0FBRTFGLGVBQUE7QUFBQSxNQUFPLEtBQUE7QUFFUCxlQUFBO0FBQUEsTUFBTyxLQUFBO0FBRVAsZUFBQSxPQUFBLEVBQUEsV0FBQTtBQUFBO0FBQUEsTUFBMkI7QUFHM0IsZUFBQTtBQUFBLElBQU87QUFBQSxFQUViO0FBR0EsV0FBQSxTQUFBLFFBQUEsVUFBQSxNQUFBLE1BQUE7QUFNRSxXQUFBLFNBQUEsSUFBQSxPQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsTUFBQSxFQUFBLE1BQUEsTUFBQTtBQUFBLElBRWUsQ0FBQTtBQUFBLEVBQ2pCO0FBRUEsUUFBQSxhQUFBLGlCQUFBLE1BQUE7QUFDRSxVQUFBLFNBQUEsSUFBQTtBQUFBLE1BQW1CO0FBQUEsSUFDRDtBQUlsQixtQkFBQSxjQUFBO0FBQ0UsVUFBQTtBQUNFLGNBQUEsV0FBQSxNQUFBLFlBQUE7QUFDQSxjQUFBLFFBQUEsTUFBQSxPQUFBLE1BQUEsSUFBQSxNQUFBLE9BQUEsRUFBQSxVQUFBO0FBQ0EsY0FBQSxRQUFBLE1BQUE7QUFDQSxlQUFBLE9BQUEsYUFBQSxFQUFBLE1BQUEsUUFBQSxJQUFBLE9BQUEsS0FBQSxJQUFBLElBQUE7QUFDQSxlQUFBLE9BQUEsd0JBQUEsRUFBQSxPQUFBLFVBQUEsQ0FBQTtBQUFBLE1BQTBELFFBQUE7QUFBQSxNQUNwRDtBQUFBLElBRVI7QUFHRixXQUFBLFFBQUEsWUFBQSxZQUFBLFlBQUE7QUFDRSxZQUFBLFlBQUE7QUFFQSxZQUFBLFdBQUEsTUFBQSxPQUFBLFFBQUEsS0FBQSxJQUFBLHVCQUFBO0FBQ0EsWUFBQSxXQUFBLFNBQUEseUJBQUE7QUFDQSxhQUFBLE9BQUEsT0FBQSxjQUFBLEVBQUEsaUJBQUEsVUFBQTtBQUNBLGFBQUEsT0FBQSxPQUFBLG1CQUFBLEVBQUEsaUJBQUEsS0FBQSxJQUFBO0FBR0EsYUFBQSxhQUFBLE9BQUE7QUFBQSxRQUEyQixJQUFBO0FBQUEsUUFDckIsT0FBQTtBQUFBLFFBQ0csVUFBQSxDQUFBLFdBQUE7QUFBQSxNQUNlLENBQUE7QUFFeEIsYUFBQSxhQUFBLE9BQUE7QUFBQSxRQUEyQixJQUFBO0FBQUEsUUFDckIsT0FBQTtBQUFBLFFBQ0csVUFBQSxDQUFBLFdBQUE7QUFBQSxNQUNlLENBQUE7QUFJeEIsa0JBQUE7QUFBQSxJQUFZLENBQUE7QUFJZCxXQUFBLGFBQUEsVUFBQSxZQUFBLE9BQUEsTUFBQSxRQUFBO0FBQ0UsVUFBQSxDQUFBLEtBQUEsTUFBQSxDQUFBLEtBQUEsY0FBQTtBQUNBLFlBQUEsT0FBQSxLQUFBLGNBQUEsS0FBQTtBQUNBLFVBQUEsQ0FBQSxRQUFBLEtBQUEsU0FBQSxLQUFBLEtBQUEsU0FBQSxHQUFBO0FBRUEsVUFBQTtBQUNFLFlBQUEsS0FBQSxlQUFBLHNCQUFBO0FBQ0UsZ0JBQUEsT0FBQSxLQUFBLFlBQUEsSUFBQSxJQUFBO0FBQUEsWUFBc0MsTUFBQTtBQUFBLFlBQzlCLE1BQUE7QUFBQSxVQUNBLENBQUE7QUFBQSxRQUNQLFdBQUEsS0FBQSxlQUFBLGlCQUFBO0FBR0QsZ0JBQUEsV0FBQSxNQUFBLFlBQUE7QUFDQSxnQkFBQSxjQUFBLE1BQUEsY0FBQSxJQUFBO0FBQ0EsZ0JBQUEsT0FBQSxTQUFBLElBQUEsTUFBQSxLQUFBO0FBQUEsWUFBcUM7QUFBQSxZQUNuQyxNQUFBO0FBQUEsWUFDTTtBQUFBLFlBQ04sU0FBQTtBQUFBLFlBQ1MsV0FBQSxJQUFBLE9BQUE7QUFBQSxVQUNhLENBQUE7QUFFeEIsbUJBQUEsUUFBQSxVQUFBLGNBQUEsSUFBQTtBQUNBLGdCQUFBLFdBQUEsTUFBQSxPQUFBLFNBQUEsSUFBQSxhQUFBLFNBQUE7QUFBQSxZQUFpRTtBQUFBLFlBQy9ELFFBQUE7QUFBQSxVQUNRLENBQUE7QUFFVixzQkFBQTtBQUVBLGdCQUFBLE9BQUEsS0FBQSxZQUFBLElBQUEsSUFBQTtBQUFBLFlBQXNDLE1BQUE7QUFBQSxZQUM5QixNQUFBO0FBQUEsWUFDQTtBQUFBLFlBQ04sSUFBQTtBQUFBLFVBQ0ksQ0FBQTtBQUFBLFFBQ0w7QUFBQSxNQUNILFNBQUEsR0FBQTtBQUVBLGdCQUFBLE1BQUEsa0NBQUEsQ0FBQTtBQUFBLE1BQWlEO0FBQUEsSUFDbkQsQ0FBQTtBQUlGLFdBQUEsU0FBQSxVQUFBLFlBQUEsT0FBQSxZQUFBO0FBQ0UsVUFBQSxZQUFBLHNCQUFBO0FBQ0EsVUFBQTtBQUNFLGNBQUEsT0FBQSxNQUFBLE9BQUEsS0FBQSxNQUFBLEVBQUEsUUFBQSxNQUFBLGVBQUEsTUFBQTtBQUNBLGNBQUEsTUFBQSxLQUFBLENBQUE7QUFDQSxZQUFBLENBQUEsS0FBQSxHQUFBO0FBQ0EsY0FBQSxPQUFBLEtBQUEsWUFBQSxJQUFBLElBQUEsRUFBQSxNQUFBLHNCQUFBO0FBQUEsTUFBb0UsUUFBQTtBQUFBLE1BQzlEO0FBQUEsSUFFUixDQUFBO0FBR0YsV0FBQSxPQUFBLFFBQUEsWUFBQSxPQUFBLFVBQUE7QUFFRSxVQUFBLE1BQUEsU0FBQSxtQkFBQTtBQUNFLFlBQUE7QUFDRSxnQkFBQSxPQUFBLE1BQUEsT0FBQSxRQUFBLE1BQUEsSUFBQSxlQUFBO0FBQ0EsZ0JBQUEsUUFBQSxLQUFBO0FBQ0EsY0FBQSxDQUFBLE9BQUEsS0FBQTtBQUNBLGdCQUFBLGVBQUEsS0FBQSxJQUFBLElBQUEsSUFBQSxLQUFBLEtBQUEsS0FBQTtBQUNBLGdCQUFBLFdBQUEsQ0FBQTtBQUNBLHFCQUFBLENBQUEsT0FBQSxLQUFBLEtBQUEsT0FBQSxRQUFBLE1BQUEsSUFBQSxHQUFBO0FBQ0UsZ0JBQUEsTUFBQSxjQUFBLGNBQUE7QUFDRSx1QkFBQSxLQUFBLElBQUE7QUFBQSxZQUFrQjtBQUFBLFVBQ3BCO0FBRUYsZ0JBQUEsT0FBQSxRQUFBLE1BQUEsSUFBQSxFQUFBLGVBQUEsRUFBQSxNQUFBLFNBQUEsR0FBQTtBQUFBLFFBQW9FLFNBQUEsR0FBQTtBQUVwRSxrQkFBQSxNQUFBLGlDQUFBLENBQUE7QUFBQSxRQUFnRDtBQUVsRDtBQUFBLE1BQUE7QUFHRixVQUFBLE1BQUEsU0FBQSxhQUFBO0FBRUEsVUFBQTtBQUNFLGNBQUEsV0FBQSxNQUFBLFlBQUE7QUFHQSxjQUFBLFdBQUEsTUFBQSxPQUFBLFFBQUEsS0FBQSxJQUFBO0FBQUEsVUFBK0M7QUFBQSxVQUM3QztBQUFBLFVBQ0E7QUFBQSxRQUNBLENBQUE7QUFFRixZQUFBLFNBQUEsWUFBQSxLQUFBLElBQUEsSUFBQSxTQUFBLFNBQUE7QUFHQSxjQUFBLFlBQUEsU0FBQSxtQkFBQTtBQUNBLGNBQUEsWUFBQSxNQUFBLE9BQUEsUUFBQSxNQUFBLElBQUE7QUFBQSxVQUFpRDtBQUFBLFVBQy9DO0FBQUEsUUFDQSxDQUFBO0FBR0YsY0FBQSxTQUFBLG9CQUFBLEtBQUEsR0FBQSxZQUFBLEVBQUEsTUFBQSxHQUFBLEVBQUE7QUFDQSxZQUFBLGNBQUEsVUFBQSxvQkFBQTtBQUNBLFlBQUEsVUFBQSx1QkFBQSxPQUFBO0FBQ0Usd0JBQUE7QUFDQSxnQkFBQSxPQUFBLFFBQUEsTUFBQSxJQUFBLEVBQUEsa0JBQUEsR0FBQSxvQkFBQSxPQUFBO0FBQUEsUUFBaUY7QUFFbkYsWUFBQSxlQUFBLFVBQUE7QUFFQSxjQUFBLFFBQUEsTUFBQSxPQUFBLE1BQUEsSUFBQSxNQUFBLGdCQUFBO0FBQUEsVUFBMkQ7QUFBQSxVQUN6RCxPQUFBO0FBQUEsUUFDTyxDQUFBO0FBR1QsWUFBQSxNQUFBLFdBQUEsRUFBQTtBQUVBLGNBQUEsT0FBQSxNQUFBLE9BQUEsS0FBQSxNQUFBO0FBQUEsVUFBcUMsUUFBQTtBQUFBLFVBQzNCLGVBQUE7QUFBQSxRQUNPLENBQUE7QUFFakIsY0FBQSxNQUFBLEtBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxLQUFBLEdBQUE7QUFHQSxZQUFBLElBQUEsUUFBQSxJQUFBLElBQUEsV0FBQSxXQUFBLEtBQUEsSUFBQSxJQUFBLFdBQUEscUJBQUEsSUFBQTtBQUNFO0FBQUEsUUFBQTtBQUdGLFlBQUE7QUFDRSxnQkFBQSxPQUFBLEtBQUEsWUFBQSxJQUFBLElBQUE7QUFBQSxZQUFzQyxNQUFBO0FBQUEsWUFDOUIsTUFBQSxNQUFBLENBQUE7QUFBQSxVQUNPLENBQUE7QUFHZixnQkFBQSxPQUFBLFFBQUEsTUFBQSxJQUFBLEVBQUEsa0JBQUEsY0FBQSxHQUFBO0FBRUEsbUJBQUEsUUFBQSxVQUFBLGVBQUEsTUFBQSxDQUFBLEVBQUEsSUFBQTtBQUFBLFFBQXVELFFBQUE7QUFBQSxRQUNqRDtBQUFBLE1BRVIsU0FBQSxHQUFBO0FBRUEsZ0JBQUEsTUFBQSxtQ0FBQSxDQUFBO0FBQUEsTUFBa0Q7QUFBQSxJQUNwRCxDQUFBO0FBR0YsV0FBQSxRQUFBLFVBQUEsWUFBQSxDQUFBLFNBQUEsUUFBQSxpQkFBQTtBQUNFLFVBQUEsQ0FBQSxlQUFBLE9BQUEsR0FBQTtBQUNFLHFCQUFBLEVBQUEsT0FBQSx3QkFBQTtBQUNBLGVBQUE7QUFBQSxNQUFPO0FBR1Qsb0JBQUEsU0FBQSxRQUFBLFdBQUEsRUFBQSxLQUFBLFlBQUE7QUFDQSxhQUFBO0FBQUEsSUFBTyxDQUFBO0FBQUEsRUFFWCxDQUFBO0FBRUEsaUJBQUEsY0FBQSxTQUFBLFFBQUEsYUFBQTtBQUNFLFVBQUEsV0FBQSxNQUFBLFlBQUE7QUFFQSxZQUFBLFFBQUEsTUFBQTtBQUFBLE1BQXNCLEtBQUEsa0JBQUE7QUFFbEIsWUFBQTtBQUNFLGdCQUFBLGNBQUEsTUFBQSxjQUFBLFFBQUEsTUFBQSxRQUFBLElBQUE7QUFDQSxtQkFBQSxRQUFBLFVBQUEsZUFBQSxRQUFBLElBQUE7QUFDQSxpQkFBQSxFQUFBLFNBQUEsTUFBQSxZQUFBO0FBQUEsUUFBb0MsU0FBQSxHQUFBO0FBRXBDLGlCQUFBLEVBQUEsU0FBQSxPQUFBLE9BQUEsT0FBQSxDQUFBLEVBQUE7QUFBQSxRQUEwQztBQUFBLE1BQzVDO0FBQUEsTUFDRixLQUFBLGFBQUE7QUFHRSxZQUFBO0FBQ0UsZ0JBQUEsU0FBQSxNQUFBLE9BQUEsU0FBQSxJQUFBLE1BQUEsS0FBQTtBQUFBLFlBQW9EO0FBQUEsWUFDbEQsTUFBQSxRQUFBO0FBQUEsWUFDYyxhQUFBLFFBQUE7QUFBQSxZQUNPLFNBQUEsUUFBQSxXQUFBO0FBQUEsWUFDTyxXQUFBLFFBQUEsYUFBQTtBQUFBLFlBQ0ksZ0JBQUEsUUFBQTtBQUFBLFlBQ1IsZUFBQSxRQUFBO0FBQUEsVUFDRCxDQUFBO0FBRXpCLG1CQUFBLFFBQUEsVUFBQSxjQUFBLFFBQUEsSUFBQTtBQUVBLGdCQUFBLFdBQUEsTUFBQSxPQUFBLFNBQUEsSUFBQSxhQUFBLFNBQUE7QUFBQSxZQUFpRTtBQUFBLFlBQy9ELFFBQUE7QUFBQSxVQUNRLENBQUE7QUFFVixzQkFBQTtBQUNBLGlCQUFBLEVBQUEsU0FBQSxNQUFBLElBQUEsVUFBQSxPQUFBO0FBQUEsUUFBNkMsU0FBQSxHQUFBO0FBRTdDLGlCQUFBLEVBQUEsU0FBQSxPQUFBLE9BQUEsT0FBQSxDQUFBLEVBQUE7QUFBQSxRQUEwQztBQUFBLE1BQzVDO0FBQUEsTUFDRixLQUFBLGlCQUFBO0FBR0UsWUFBQTtBQUNFLGdCQUFBRCxVQUFBLE1BQUEsT0FBQSxTQUFBLElBQUEsTUFBQSxjQUFBO0FBQUEsWUFBNkQsSUFBQSxRQUFBO0FBQUEsWUFDL0M7QUFBQSxZQUNaLFlBQUEsUUFBQTtBQUFBLFVBQ29CLENBQUE7QUFFdEI7QUFBQSxZQUFBO0FBQUEsWUFDRTtBQUFBLFlBQ0EsUUFBQSxhQUFBLHNCQUFBO0FBQUEsVUFDMkM7QUFHN0MsZ0JBQUEsV0FBQSxNQUFBLE9BQUEsU0FBQSxJQUFBLGFBQUEsU0FBQTtBQUFBLFlBQWlFO0FBQUEsWUFDL0QsUUFBQSxRQUFBLGFBQUEsc0JBQUE7QUFBQSxVQUNtRCxDQUFBO0FBRXJELGlCQUFBO0FBQUEsWUFBTyxTQUFBO0FBQUEsWUFDSSxXQUFBQSxTQUFBO0FBQUEsWUFDVSxjQUFBQSxTQUFBO0FBQUEsWUFDRyxJQUFBO0FBQUEsVUFDbEI7QUFBQSxRQUNOLFNBQUEsR0FBQTtBQUVBLGlCQUFBLEVBQUEsU0FBQSxPQUFBLE9BQUEsT0FBQSxDQUFBLEVBQUE7QUFBQSxRQUEwQztBQUFBLE1BQzVDO0FBQUEsTUFDRixLQUFBLGlCQUFBO0FBR0UsZUFBQSxFQUFBLFNBQUE7QUFBQSxNQUFrQjtBQUFBLE1BQ3BCLEtBQUEsYUFBQTtBQUdFLFlBQUE7QUFDRSxnQkFBQSxhQUFBLE1BQUEsT0FBQSxNQUFBLElBQUEsTUFBQSxZQUFBLEVBQUEsVUFBQTtBQUNBLGdCQUFBLFdBQUEsSUFBQSxJQUFBLFdBQUEsSUFBQSxDQUFBLE1BQUEsRUFBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLGdCQUFBLFVBQUEsUUFBQSxNQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsU0FBQSxJQUFBLEVBQUEsWUFBQSxDQUFBLENBQUE7QUFDQSxpQkFBQSxFQUFBLFNBQUEsTUFBQSxPQUFBLFFBQUEsTUFBQSxHQUFBLEVBQUEsRUFBQTtBQUFBLFFBQW9ELFNBQUEsR0FBQTtBQUVwRCxpQkFBQSxFQUFBLFNBQUEsT0FBQSxPQUFBLE9BQUEsQ0FBQSxFQUFBO0FBQUEsUUFBMEM7QUFBQSxNQUM1QztBQUFBLE1BQ0YsS0FBQSxtQkFBQTtBQUdFLFlBQUE7QUFDRSxnQkFBQSxRQUFBLE1BQUEsT0FBQSxNQUFBLElBQUEsTUFBQSxlQUFBLEVBQUEsVUFBQTtBQUNBLGlCQUFBLEVBQUEsU0FBQSxNQUFBLEdBQUEsTUFBQTtBQUFBLFFBQWlDLFNBQUEsR0FBQTtBQUVqQyxpQkFBQSxFQUFBLFNBQUEsT0FBQSxPQUFBLE9BQUEsQ0FBQSxFQUFBO0FBQUEsUUFBMEM7QUFBQSxNQUM1QztBQUFBLE1BQ0YsS0FBQSxjQUFBO0FBR0UsWUFBQTtBQUVFLGdCQUFBLFdBQUEsTUFBQSxpQkFBQTtBQUNBLGNBQUEsQ0FBQSxTQUFBLFNBQUE7QUFDRSxtQkFBQSxFQUFBLFNBQUEsT0FBQSxPQUFBLDBCQUFBLFdBQUEsRUFBQTtBQUFBLFVBQXVFO0FBRXpFLGdCQUFBQSxVQUFBLE1BQUEsT0FBQSxPQUFBLElBQUEsR0FBQSxhQUFBO0FBQUEsWUFBdUQsTUFBQSxRQUFBO0FBQUEsWUFDdkMsVUFBQSxRQUFBO0FBQUEsWUFDSSxZQUFBLFFBQUE7QUFBQSxZQUNFLFdBQUEsUUFBQTtBQUFBLFVBQ0QsQ0FBQTtBQUVyQixpQkFBQSxFQUFBLFNBQUEsTUFBQSxhQUFBQSxRQUFBLGFBQUEsV0FBQSxTQUFBLFVBQUE7QUFBQSxRQUF1RixTQUFBLEdBQUE7QUFFdkYsaUJBQUEsRUFBQSxTQUFBLE9BQUEsT0FBQSxPQUFBLENBQUEsRUFBQTtBQUFBLFFBQTBDO0FBQUEsTUFDNUM7QUFBQSxNQUNGLEtBQUEsZUFBQTtBQUdFLFlBQUE7QUFFRSxnQkFBQSxXQUFBLE1BQUEsaUJBQUE7QUFDQSxjQUFBLENBQUEsU0FBQSxTQUFBO0FBQ0UsbUJBQUEsRUFBQSxTQUFBLE9BQUEsT0FBQSwwQkFBQSxXQUFBLEVBQUE7QUFBQSxVQUF1RTtBQUV6RSxnQkFBQUEsVUFBQSxNQUFBLE9BQUEsT0FBQSxJQUFBLEdBQUEsY0FBQTtBQUFBLFlBQXdELE1BQUEsUUFBQTtBQUFBLFlBQ3hDLFdBQUEsUUFBQTtBQUFBLFVBQ0ssQ0FBQTtBQUVyQixpQkFBQTtBQUFBLFlBQU8sU0FBQTtBQUFBLFlBQ0ksWUFBQUEsUUFBQTtBQUFBLFlBQ1UsZ0JBQUEsUUFBQSxLQUFBO0FBQUEsWUFDVSxXQUFBLFNBQUE7QUFBQSxVQUNUO0FBQUEsUUFDdEIsU0FBQSxHQUFBO0FBRUEsaUJBQUEsRUFBQSxTQUFBLE9BQUEsT0FBQSxPQUFBLENBQUEsRUFBQTtBQUFBLFFBQTBDO0FBQUEsTUFDNUM7QUFBQSxNQUNGLEtBQUEsYUFBQTtBQUdFLFlBQUE7QUFDRSxnQkFBQSxTQUFBLE1BQUEsY0FBQTtBQUNBLGlCQUFBLEVBQUEsU0FBQSxNQUFBLEdBQUEsT0FBQTtBQUFBLFFBQWtDLFNBQUEsR0FBQTtBQUVsQyxpQkFBQSxFQUFBLFNBQUEsT0FBQSxPQUFBLE9BQUEsQ0FBQSxFQUFBO0FBQUEsUUFBMEM7QUFBQSxNQUM1QztBQUFBLE1BQ0YsS0FBQSxxQkFBQTtBQUdFLFlBQUE7QUFDRSxnQkFBQSxPQUFBLE1BQUEsT0FBQSxNQUFBLElBQUEsTUFBQSxZQUFBO0FBQUEsWUFBc0Q7QUFBQSxZQUNwRCxPQUFBLFFBQUE7QUFBQSxZQUNlLE1BQUEsUUFBQTtBQUFBLFVBQ0QsQ0FBQTtBQUVoQixpQkFBQSxFQUFBLFNBQUEsTUFBQSxLQUFBO0FBQUEsUUFBNkIsU0FBQSxHQUFBO0FBRTdCLGlCQUFBLEVBQUEsU0FBQSxPQUFBLE9BQUEsT0FBQSxDQUFBLEVBQUE7QUFBQSxRQUEwQztBQUFBLE1BQzVDO0FBQUEsTUFDRixLQUFBLGVBQUE7QUFHRSxZQUFBO0FBQ0UsZ0JBQUEsT0FBQSxTQUFBLElBQUEsTUFBQSxZQUFBO0FBQUEsWUFBNEMsSUFBQSxRQUFBO0FBQUEsWUFDOUI7QUFBQSxVQUNaLENBQUE7QUFFRixpQkFBQSxFQUFBLFNBQUEsS0FBQTtBQUFBLFFBQXVCLFNBQUEsR0FBQTtBQUV2QixpQkFBQSxFQUFBLFNBQUEsT0FBQSxPQUFBLE9BQUEsQ0FBQSxFQUFBO0FBQUEsUUFBMEM7QUFBQSxNQUM1QztBQUFBLE1BQ0YsS0FBQSxlQUFBO0FBR0UsWUFBQTtBQUNFLGdCQUFBQSxVQUFBLE1BQUEsT0FBQSxTQUFBLElBQUEsTUFBQSxZQUFBO0FBQUEsWUFBMkQsSUFBQSxRQUFBO0FBQUEsWUFDN0M7QUFBQSxZQUNaLFVBQUEsUUFBQTtBQUFBLFlBQ2tCLEtBQUEsUUFBQTtBQUFBLFVBQ0wsQ0FBQTtBQUVmLGlCQUFBLEVBQUEsU0FBQSxNQUFBLFdBQUFBLFNBQUEsYUFBQSxNQUFBO0FBQUEsUUFBOEQsU0FBQSxHQUFBO0FBRTlELGlCQUFBLEVBQUEsU0FBQSxPQUFBLE9BQUEsT0FBQSxDQUFBLEVBQUE7QUFBQSxRQUEwQztBQUFBLE1BQzVDO0FBQUEsTUFDRixLQUFBLGFBQUE7QUFHRSxZQUFBO0FBQ0UsZ0JBQUEsUUFBQSxNQUFBLE9BQUEsTUFBQSxJQUFBLGFBQUEsVUFBQSxFQUFBLFVBQUE7QUFDQSxpQkFBQSxFQUFBLFNBQUEsTUFBQSxNQUFBO0FBQUEsUUFBOEIsU0FBQSxHQUFBO0FBRTlCLGlCQUFBLEVBQUEsU0FBQSxPQUFBLE9BQUEsT0FBQSxDQUFBLEVBQUE7QUFBQSxRQUEwQztBQUFBLE1BQzVDO0FBQUEsTUFDRixLQUFBLG9CQUFBO0FBR0UsWUFBQTtBQUNFLGdCQUFBLGVBQUEsTUFBQSxPQUFBLE1BQUEsSUFBQSxhQUFBLGlCQUFBLEVBQUEsVUFBQTtBQUNBLGlCQUFBLEVBQUEsU0FBQSxNQUFBLGFBQUE7QUFBQSxRQUFxQyxTQUFBLEdBQUE7QUFFckMsaUJBQUEsRUFBQSxTQUFBLE9BQUEsT0FBQSxPQUFBLENBQUEsRUFBQTtBQUFBLFFBQTBDO0FBQUEsTUFDNUM7QUFBQSxNQUNGLEtBQUEsZUFBQTtBQUdFLFlBQUE7QUFDRSxnQkFBQSxPQUFBLFNBQUEsSUFBQSxNQUFBLFFBQUE7QUFBQSxZQUF3QyxJQUFBLFFBQUE7QUFBQSxZQUMxQjtBQUFBLFVBQ1osQ0FBQTtBQUVGLHNCQUFBO0FBQ0EsaUJBQUEsRUFBQSxTQUFBLEtBQUE7QUFBQSxRQUF1QixTQUFBLEdBQUE7QUFFdkIsaUJBQUEsRUFBQSxTQUFBLE9BQUEsT0FBQSxPQUFBLENBQUEsRUFBQTtBQUFBLFFBQTBDO0FBQUEsTUFDNUM7QUFBQSxJQUNGO0FBQUEsRUFJSjs7O0FDeGdCTyxRQUFNRSxZQUFVLFdBQVcsU0FBUyxTQUFTLEtBQ2hELFdBQVcsVUFDWCxXQUFXO0FDV2YsUUFBTSxVQUFVO0FDYmhCLE1BQUksZ0JBQWdCLE1BQU07QUFBQSxJQUN4QixZQUFZLGNBQWM7QUFDeEIsVUFBSSxpQkFBaUIsY0FBYztBQUNqQyxhQUFLLFlBQVk7QUFDakIsYUFBSyxrQkFBa0IsQ0FBQyxHQUFHLGNBQWMsU0FBUztBQUNsRCxhQUFLLGdCQUFnQjtBQUNyQixhQUFLLGdCQUFnQjtBQUFBLE1BQ3ZCLE9BQU87QUFDTCxjQUFNLFNBQVMsdUJBQXVCLEtBQUssWUFBWTtBQUN2RCxZQUFJLFVBQVU7QUFDWixnQkFBTSxJQUFJLG9CQUFvQixjQUFjLGtCQUFrQjtBQUNoRSxjQUFNLENBQUMsR0FBRyxVQUFVLFVBQVUsUUFBUSxJQUFJO0FBQzFDLHlCQUFpQixjQUFjLFFBQVE7QUFDdkMseUJBQWlCLGNBQWMsUUFBUTtBQUV2QyxhQUFLLGtCQUFrQixhQUFhLE1BQU0sQ0FBQyxRQUFRLE9BQU8sSUFBSSxDQUFDLFFBQVE7QUFDdkUsYUFBSyxnQkFBZ0I7QUFDckIsYUFBSyxnQkFBZ0I7QUFBQSxNQUN2QjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVMsS0FBSztBQUNaLFVBQUksS0FBSztBQUNQLGVBQU87QUFDVCxZQUFNLElBQUksT0FBTyxRQUFRLFdBQVcsSUFBSSxJQUFJLEdBQUcsSUFBSSxlQUFlLFdBQVcsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQ2pHLGFBQU8sQ0FBQyxDQUFDLEtBQUssZ0JBQWdCLEtBQUssQ0FBQyxhQUFhO0FBQy9DLFlBQUksYUFBYTtBQUNmLGlCQUFPLEtBQUssWUFBWSxDQUFDO0FBQzNCLFlBQUksYUFBYTtBQUNmLGlCQUFPLEtBQUssYUFBYSxDQUFDO0FBQzVCLFlBQUksYUFBYTtBQUNmLGlCQUFPLEtBQUssWUFBWSxDQUFDO0FBQzNCLFlBQUksYUFBYTtBQUNmLGlCQUFPLEtBQUssV0FBVyxDQUFDO0FBQzFCLFlBQUksYUFBYTtBQUNmLGlCQUFPLEtBQUssV0FBVyxDQUFDO0FBQUEsTUFDNUIsQ0FBQztBQUFBLElBQ0g7QUFBQSxJQUNBLFlBQVksS0FBSztBQUNmLGFBQU8sSUFBSSxhQUFhLFdBQVcsS0FBSyxnQkFBZ0IsR0FBRztBQUFBLElBQzdEO0FBQUEsSUFDQSxhQUFhLEtBQUs7QUFDaEIsYUFBTyxJQUFJLGFBQWEsWUFBWSxLQUFLLGdCQUFnQixHQUFHO0FBQUEsSUFDOUQ7QUFBQSxJQUNBLGdCQUFnQixLQUFLO0FBQ25CLFVBQUksQ0FBQyxLQUFLLGlCQUFpQixDQUFDLEtBQUs7QUFDL0IsZUFBTztBQUNULFlBQU0sc0JBQXNCO0FBQUEsUUFDMUIsS0FBSyxzQkFBc0IsS0FBSyxhQUFhO0FBQUEsUUFDN0MsS0FBSyxzQkFBc0IsS0FBSyxjQUFjLFFBQVEsU0FBUyxFQUFFLENBQUM7QUFBQSxNQUN4RTtBQUNJLFlBQU0scUJBQXFCLEtBQUssc0JBQXNCLEtBQUssYUFBYTtBQUN4RSxhQUFPLENBQUMsQ0FBQyxvQkFBb0IsS0FBSyxDQUFDLFVBQVUsTUFBTSxLQUFLLElBQUksUUFBUSxDQUFDLEtBQUssbUJBQW1CLEtBQUssSUFBSSxRQUFRO0FBQUEsSUFDaEg7QUFBQSxJQUNBLFlBQVksS0FBSztBQUNmLFlBQU0sTUFBTSxxRUFBcUU7QUFBQSxJQUNuRjtBQUFBLElBQ0EsV0FBVyxLQUFLO0FBQ2QsWUFBTSxNQUFNLG9FQUFvRTtBQUFBLElBQ2xGO0FBQUEsSUFDQSxXQUFXLEtBQUs7QUFDZCxZQUFNLE1BQU0sb0VBQW9FO0FBQUEsSUFDbEY7QUFBQSxJQUNBLHNCQUFzQixTQUFTO0FBQzdCLFlBQU0sVUFBVSxLQUFLLGVBQWUsT0FBTztBQUMzQyxZQUFNLGdCQUFnQixRQUFRLFFBQVEsU0FBUyxJQUFJO0FBQ25ELGFBQU8sT0FBTyxJQUFJLGFBQWEsR0FBRztBQUFBLElBQ3BDO0FBQUEsSUFDQSxlQUFlLFFBQVE7QUFDckIsYUFBTyxPQUFPLFFBQVEsdUJBQXVCLE1BQU07QUFBQSxJQUNyRDtBQUFBLEVBQ0Y7QUFDQSxNQUFJLGVBQWU7QUFDbkIsZUFBYSxZQUFZLENBQUMsUUFBUSxTQUFTLFFBQVEsT0FBTyxLQUFLO0FBQy9ELE1BQUksc0JBQXNCLGNBQWMsTUFBTTtBQUFBLElBQzVDLFlBQVksY0FBYyxRQUFRO0FBQ2hDLFlBQU0sMEJBQTBCLFlBQVksTUFBTSxNQUFNLEVBQUU7QUFBQSxJQUM1RDtBQUFBLEVBQ0Y7QUFDQSxXQUFTLGlCQUFpQixjQUFjLFVBQVU7QUFDaEQsUUFBSSxDQUFDLGFBQWEsVUFBVSxTQUFTLFFBQVEsS0FBSyxhQUFhO0FBQzdELFlBQU0sSUFBSTtBQUFBLFFBQ1I7QUFBQSxRQUNBLEdBQUcsUUFBUSwwQkFBMEIsYUFBYSxVQUFVLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDNUU7QUFBQSxFQUNBO0FBQ0EsV0FBUyxpQkFBaUIsY0FBYyxVQUFVO0FBQ2hELFFBQUksU0FBUyxTQUFTLEdBQUc7QUFDdkIsWUFBTSxJQUFJLG9CQUFvQixjQUFjLGdDQUFnQztBQUM5RSxRQUFJLFNBQVMsU0FBUyxHQUFHLEtBQUssU0FBUyxTQUFTLEtBQUssQ0FBQyxTQUFTLFdBQVcsSUFBSTtBQUM1RSxZQUFNLElBQUk7QUFBQSxRQUNSO0FBQUEsUUFDQTtBQUFBLE1BQ047QUFBQSxFQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwxLDIsMyw0LDUsNiw3LDgsOSwxMCwxMSwxMiwxOCwxOSwyMF19
