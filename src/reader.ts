export class UnexpectedEOFError extends Error {
  constructor() {
    super(`Unexpected EOF`);
  }
}

export class ByteReader {
  private offset: number;
  private buffer: Uint8Array;
  constructor(private src?: AsyncIterator<Uint8Array>) {
    this.offset = 0;
    this.buffer = new Uint8Array();
  }
  private async next() {
    if (this.src === undefined) return false;
    const { done, value } = await this.src.next();
    if (done) {
      this.src = undefined;
      return false;
    }
    this.buffer = value;
    return true;
  }

  async fill(out: Uint8Array) {
    let n = 0;
    while (n < out.length) {
      if (this.offset === this.buffer.length) {
        if (!await this.next()) {
          throw new UnexpectedEOFError();
        }
      } else {
        const len = Math.min(out.length - n, this.buffer.length - this.offset);
        out.set(this.buffer.subarray(this.offset, this.offset + len), n);
        n += len;
        this.offset += len;
      }
    }
  }

  async byte() {
    while (this.offset === this.buffer.length) {
      if (!await this.next()) {
        throw new UnexpectedEOFError();
      }
    }
    return this.buffer[this.offset++];
  }

  async buf() {
    while (this.offset === this.buffer.length) {
      if (!await this.next()) {
        return new Uint8Array();
      }
    }
    const buffer = this.buffer.subarray(this.offset);
    this.offset = 0;
    this.buffer = new Uint8Array();
    return buffer;
  }
}

export class ByteStream implements AsyncIterator<Uint8Array> {
  private resolve: ((result: IteratorResult<Uint8Array>) => void) | null = null;
  private cache: Uint8Array[] = [];
  private ended = false;
  private ondata: Promise<IteratorResult<Uint8Array>> | null = null;

  push(buffer: Uint8Array) {
    if (this.ended) {
      throw new Error(`Cannot push after end`);
    }
    if (this.resolve === null) {
      this.cache.push(buffer);
    } else {
      this.resolve({ value: buffer });
      this.resolve = null;
    }
  }

  end() {
    this.ended = true;
    if (this.resolve !== null) {
      this.resolve({ done: true, value: undefined });
      this.resolve = null;
    }
  }

  async next() {
    await this.ondata;
    this.ondata = new Promise<IteratorResult<Uint8Array>>((resolve) => {
      const value = this.cache.shift();
      if (value !== undefined) {
        resolve({ done: false, value });
      } else if (this.ended) {
        resolve({ done: true, value: undefined });
      } else {
        this.resolve = resolve;
      }
    });
    return this.ondata;
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
