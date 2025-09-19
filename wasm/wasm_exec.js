// Go WASM runtime for Node.js
// This is a Node.js-compatible version of wasm_exec.js

const fs = require('fs');
const crypto = require('crypto');

if (typeof global !== 'undefined') {
    global.require = require;
    global.fs = fs;
    global.crypto = crypto;
}

const encoder = new TextEncoder('utf-8');
const decoder = new TextDecoder('utf-8');

let mem;
let offset = 1024;
let heap;
let heapNext;

const ID = function() { return id++; };
let id = 1;

const int32 = new Int32Array(2);
const float64 = new Float64Array(int32.buffer);

const setInt64 = (addr, v) => {
    int32[0] = v;
    int32[1] = v / 4294967296;
    mem.set(int32, addr);
};

const getInt64 = (addr) => {
    mem.copy(int32, 0, addr, addr + 8);
    return int32[0] + int32[1] * 4294967296;
};

const setInt32 = (addr, v) => {
    mem.setInt32(addr, v, true);
};

const getInt32 = (addr) => {
    return mem.getInt32(addr, true);
};

const setUint32 = (addr, v) => {
    mem.setUint32(addr, v, true);
};

const getUint32 = (addr) => {
    return mem.getUint32(addr, true);
};

const setFloat64 = (addr, v) => {
    float64[0] = v;
    mem.set(float64, addr);
};

const getFloat64 = (addr) => {
    mem.copy(float64, 0, addr, addr + 8);
    return float64[0];
};

const loadValue = (addr) => {
    const f = getFloat64(addr);
    if (f === 0) {
        return undefined;
    }
    if (!isNaN(f)) {
        return f;
    }

    const id = getUint32(addr);
    return this._values[id];
};

const storeValue = (addr, v) => {
    const nanHead = 0x7FF80000;

    if (typeof v === 'number') {
        if (isNaN(v)) {
            setInt32(addr + 4, nanHead);
            setInt32(addr, 0);
            return;
        }
        if (v === 0) {
            setInt32(addr + 4, nanHead);
            setInt32(addr, 1);
            return;
        }
        setFloat64(addr, v);
        return;
    }

    switch (v) {
        case undefined:
            setFloat64(addr, 0);
            return;
        case null:
            setInt32(addr + 4, nanHead);
            setInt32(addr, 2);
            return;
        case true:
            setInt32(addr + 4, nanHead);
            setInt32(addr, 3);
            return;
        case false:
            setInt32(addr + 4, nanHead);
            setInt32(addr, 4);
            return;
    }

    let ref = this._refs.get(v);
    if (ref === undefined) {
        ref = this._values.length;
        this._values.push(v);
        this._refs.set(v, ref);
    }
    let typeFlag = 0;
    switch (typeof v) {
        case 'string':
            typeFlag = 1;
            break;
        case 'symbol':
            typeFlag = 2;
            break;
        case 'function':
            typeFlag = 3;
            break;
    }
    setInt32(addr + 4, nanHead | typeFlag);
    setInt32(addr, ref);
};

const loadSlice = (addr) => {
    const array = getInt64(addr + 0);
    const len = getInt64(addr + 8);
    return new Uint8Array(this._inst.exports.mem.buffer, array, len);
};

const loadSliceOfValues = (addr) => {
    const array = getInt64(addr + 0);
    const len = getInt64(addr + 8);
    const a = new Array(len);
    for (let i = 0; i < len; i++) {
        a[i] = loadValue(array + i * 8);
    }
    return a;
};

const loadString = (addr) => {
    const saddr = getInt64(addr + 0);
    const len = getInt64(addr + 8);
    return decoder.decode(new Uint8Array(this._inst.exports.mem.buffer, saddr, len));
};

const timeOrigin = Date.now() - performance.now();

const imports = {
    go: {
        // Go's runtime functions
        'runtime.wasmExit': (sp) => {
            const code = mem.getInt32(sp + 8, true);
            this.exited = true;
            delete this._inst;
            delete this._values;
            delete this._refs;
            delete this._goRefCounts;
            delete this._ids;
            delete this._idPool;
            this.exit(code);
        },

        'runtime.wasmWrite': (sp) => {
            const fd = getInt32(sp + 8);
            const p = getInt64(sp + 16);
            const n = mem.getInt32(sp + 24, true);
            fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n));
        },

        'runtime.resetMemoryDataView': (sp) => {
            mem = new DataView(this._inst.exports.mem.buffer);
        },

        'runtime.nanotime1': (sp) => {
            setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
        },

        'runtime.walltime': (sp) => {
            const msec = (new Date).getTime();
            setInt64(sp + 8, msec / 1000);
            mem.setInt32(sp + 16, (msec % 1000) * 1000000, true);
        },

        'runtime.scheduleTimeoutEvent': (sp) => {
            const id = this._nextCallbackTimeoutID;
            this._nextCallbackTimeoutID++;
            const delay = getInt64(sp + 8);
            setTimeout(() => {
                this._resume();
                while (this._scheduledTimeouts.has(id)) {
                    this._scheduledTimeouts.delete(id);
                    const toCall = this._scheduledTimeouts.get(id);
                    toCall();
                }
            }, delay);
            this._scheduledTimeouts.set(id, null);
            setInt64(sp + 16, id);
        },

        'runtime.clearTimeoutEvent': (sp) => {
            const id = getInt64(sp + 8);
            this._scheduledTimeouts.delete(id);
        },

        'runtime.getRandomData': (sp) => {
            const r = new Uint8Array(16);
            crypto.randomFillSync(r);
            const ptr = getInt64(sp + 8);
            mem.set(r, ptr);
        },

        // syscall/js functions
        'syscall/js.finalizeRef': (sp) => {
            const id = getInt64(sp + 8);
            this._goRefCounts[id]--;
            if (this._goRefCounts[id] === 0) {
                const v = this._values[id];
                this._values[id] = null;
                this._refs.delete(v);
            }
        },

        'syscall/js.stringVal': (sp) => {
            this.storeValue(sp + 24, loadString(sp + 8));
        },

        'syscall/js.valueGet': (sp) => {
            const result = Reflect.get(loadValue(sp + 8), loadString(sp + 16));
            this.storeValue(sp + 32, result);
        },

        'syscall/js.valueSet': (sp) => {
            Reflect.set(loadValue(sp + 8), loadString(sp + 16), loadValue(sp + 24));
        },

        'syscall/js.valueCall': (sp) => {
            const v = loadValue(sp + 8);
            const m = loadValue(sp + 16);
            const args = loadSliceOfValues(sp + 32);
            const result = Reflect.apply(m, v, args);
            this.storeValue(sp + 40, result);
        },

        'syscall/js.valueInvoke': (sp) => {
            const v = loadValue(sp + 8);
            const args = loadSliceOfValues(sp + 16);
            const result = Reflect.apply(v, undefined, args);
            this.storeValue(sp + 24, result);
        },

        'syscall/js.valueNew': (sp) => {
            const v = loadValue(sp + 8);
            const args = loadSliceOfValues(sp + 16);
            const result = Reflect.construct(v, args);
            this.storeValue(sp + 24, result);
        },

        'syscall/js.valueIndex': (sp) => {
            const v = loadValue(sp + 8);
            const i = getInt64(sp + 16);
            this.storeValue(sp + 24, Reflect.get(v, i));
        },

        'syscall/js.valueSetIndex': (sp) => {
            const v = loadValue(sp + 8);
            const i = getInt64(sp + 16);
            const x = loadValue(sp + 24);
            Reflect.set(v, i, x);
        },

        'syscall/js.valueLength': (sp) => {
            setInt64(sp + 16, parseInt(loadValue(sp + 8).length));
        },

        'syscall/js.valuePrepareString': (sp) => {
            const str = encoder.encode(loadString(sp + 8));
            const ptr = this._malloc(str.length + 1);
            mem.set(str, ptr);
            mem.setUint8(ptr + str.length, 0);
            setInt64(sp + 16, ptr);
        },

        'syscall/js.valueLoadString': (sp) => {
            const ptr = getInt64(sp + 8);
            const len = getInt64(sp + 16);
            this.storeValue(sp + 24, decoder.decode(new Uint8Array(this._inst.exports.mem.buffer, ptr, len)));
        },

        'syscall/js.valueInstanceOf': (sp) => {
            const v = loadValue(sp + 8);
            const t = loadValue(sp + 16);
            this.storeValue(sp + 24, v instanceof t);
        },

        'syscall/js.valueCopyBytesToGo': (sp) => {
            const dst = new Uint8Array(this._inst.exports.mem.buffer, getInt64(sp + 8), getInt64(sp + 16));
            const src = loadSlice(sp + 24);
            dst.set(src);
        },

        'syscall/js.valueCopyBytesToJS': (sp) => {
            const dst = loadSlice(sp + 8);
            const src = new Uint8Array(this._inst.exports.mem.buffer, getInt64(sp + 16), getInt64(sp + 24));
            dst.set(src);
        },

        'debug': (value) => {
            console.log(value);
        },
    },
};

class Go {
    constructor() {
        this.argv = ['js'];
        this.env = {};
        this.exit = process.exit;
        this._callbackTimeouts = new Map();
        this._nextCallbackTimeoutID = 1;

        this._inst = null;
        this._values = [];
        this._refs = new Map();
        this._goRefCounts = new Map();
        this._ids = new Map();
        this._idPool = [];
        this._scheduledTimeouts = new Map();
        this._exited = false;

        this._resume = () => {
            if (this.exited) {
                throw new Error('bad callback: Go program has already exited');
            }
            this._inst.exports.resume();
        };

        this._makeFuncWrapper = (id) => {
            const go = this;
            return function() {
                const event = { id: id, this: this, args: arguments };
                go._resume();
                return event.result;
            };
        };
    }

    run(instance) {
        this._inst = instance;
        this._values = [];
        this._refs = new Map();
        this._goRefCounts = new Map();
        this._ids = new Map();
        this._idPool = [];
        this._scheduledTimeouts = new Map();

        const mem = new DataView(instance.exports.mem.buffer);
        offset = 4096;

        this._inst.exports.run();
        this._resume();
    }

    _malloc(size) {
        if (this._idPool.length > 0) {
            const id = this._idPool.pop();
            this._ids.set(id, size);
            return id;
        }
        const id = this._nextCallbackTimeoutID++;
        this._ids.set(id, size);
        return id;
    }

    _free(ptr) {
        const size = this._ids.get(ptr);
        this._ids.delete(ptr);
        this._idPool.push(ptr);
        return size;
    }

    get importObject() {
        return imports;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Go };
} else if (typeof global !== 'undefined') {
    global.Go = Go;
}

