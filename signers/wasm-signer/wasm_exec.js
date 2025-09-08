// Go WASM Runtime for Node.js CommonJS
// Simplified version that works with Node.js

const crypto = require('crypto');

class Go {
    constructor() {
        this.argv = [];
        this.env = {};
        this.exit = (code) => {
            if (code !== 0) {
                console.error('Go program exited with code:', code);
            }
        };
        this.importObject = {
            go: {
                'runtime.wasmExit': (sp) => {
                    const code = this.mem.getUint32(sp + 8, true);
                    this.exit(code);
                },
                'runtime.wasmWrite': (sp) => {
                    const fd = this.mem.getUint32(sp + 8, true);
                    const p = this.mem.getUint32(sp + 16, true);
                    const n = this.mem.getUint32(sp + 24, true);
                    const buf = new Uint8Array(this.mem.buffer, p, n);
                    if (fd === 1) {
                        process.stdout.write(buf);
                    } else if (fd === 2) {
                        process.stderr.write(buf);
                    }
                },
                'runtime.resetMemoryDataView': (sp) => {
                    this.mem = new DataView(this.mem.buffer);
                },
                'runtime.nanotime1': (sp) => {
                    const now = BigInt(Math.floor(Date.now() * 1000000));
                    this.mem.setBigUint64(sp + 8, now, true);
                },
                'runtime.walltime': (sp) => {
                    const now = Date.now();
                    const sec = Math.floor(now / 1000);
                    const nsec = (now % 1000) * 1000000;
                    this.mem.setBigUint64(sp + 8, BigInt(sec), true);
                    this.mem.setUint32(sp + 16, nsec, true);
                },
                'runtime.scheduleTimeoutEvent': (sp) => {
                    const id = this.mem.getUint32(sp + 8, true);
                    const delay = this.mem.getFloat64(sp + 16, true);
                    setTimeout(() => {
                        this.mem.setUint32(sp + 24, id, true);
                        this._resume();
                    }, delay);
                },
                'runtime.clearTimeoutEvent': (sp) => {
                    // No-op for now
                },
                'runtime.getRandomData': (sp) => {
                    const p = this.mem.getUint32(sp + 8, true);
                    const n = this.mem.getUint32(sp + 16, true);
                    const buf = new Uint8Array(this.mem.buffer, p, n);
                    crypto.randomFillSync(buf);
                }
            }
        };
        this.mem = new DataView(new ArrayBuffer(65536));
    }

    async run(instance) {
        this.instance = instance;
        this.mem = new DataView(instance.exports.mem.buffer);
        this._resume();
    }

    _resume() {
        try {
            this.instance.exports.resume();
        } catch (e) {
            if (e.name === 'RuntimeError' && e.message.includes('unreachable')) {
                // Program terminated
                return;
            }
            throw e;
        }
    }
}

// Export for CommonJS
module.exports = { Go };