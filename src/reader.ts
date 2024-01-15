export class UnexpectedEOFError extends Error {
  constructor() {
    super(`Unexpected EOF`);
  }
}

export class ByteNotAlignedError extends Error {
  constructor() {
    super(`Not aligned to byte boundary`);
  }
}

const empty_buffer = new Uint8Array();
export class ByteReader {
  private offset: number = 0;
  private buffer: Uint8Array = empty_buffer;

  constructor(private src?: AsyncIterator<Uint8Array>) { }

  private async next() {
    if (this.src === undefined) return false;
    const { done, value } = await this.src.next();
    if (done) {
      this.src = undefined;
      return false;
    }
    this.buffer = value;
    this.offset = 0;
    return true;
  }

  async fill(out: Uint8Array) {
    let n = 0;
    for (; n < out.length;) {
      if (await this.eof()) {
        throw new UnexpectedEOFError();
      }
      const len = Math.min(out.length - n, this.buffer.length - this.offset);
      out.set(this.buffer.subarray(this.offset, this.offset + len), n);
      n += len;
      this.offset += len;
    }
  }

  async byte() {
    if (await this.eof()) {
      throw new UnexpectedEOFError();
    }
    return this.buffer[this.offset++];
  }

  async peek_bytes(n: number) {
    if (this.buffer.length - this.offset < n) {
      const arr = [this.buffer.subarray(this.offset)];
      let len = arr[0].length;
      for (; len < n;) {
        if (!await this.next()) break;
        len += this.buffer.length;
        arr.push(this.buffer);
      }
      this.buffer = new Uint8Array(len);
      let offset = 0;
      for (const buf of arr) {
        this.buffer.set(buf, offset);
        offset += buf.length;
      }
      this.offset = 0;
    }
    return this.buffer.subarray(this.offset, n);
  }

  async bytes(n: number) {
    const buffer = new Uint8Array(n);
    await this.fill(buffer);
    return buffer;
  }

  peek_buffer() {
    if (this.offset !== 0) {
      this.buffer = this.buffer.subarray(this.offset);
    }
    return this.buffer;
  }

  async eof() {
    while (this.offset === this.buffer.length) {
      if (!await this.next()) {
        return true;
      }
    }
    return false;
  }

  unshift(buffer: Uint8Array) {
    if (this.offset === this.buffer.length) {
      this.buffer = buffer;
      this.offset = 0;
    } else {
      const merged = new Uint8Array(this.buffer.length - this.offset + buffer.length);
      merged.set(buffer, 0);
      merged.set(this.buffer.subarray(this.offset), buffer.length);
      this.buffer = merged;
      this.offset = 0;
    }
  }
}

const done_result = { done: true, value: undefined } as const;
export class Stream<T> implements AsyncIterator<T> {
  private ended = false;
  private push_queue: T[] = [];
  private next_queue: ((result: IteratorResult<T>) => void)[] = [];

  push(value: T) {
    if (this.ended) {
      throw new Error(`Cannot push after end`);
    }
    if (this.push_queue.length > 0) {
      this.push_queue.push(value);
      return false;
    }
    const resolve = this.next_queue.shift();
    if (resolve === undefined) {
      this.push_queue.push(value);
      return false;
    }
    resolve({ done: false, value });
    return true;
  }

  end() {
    this.ended = true;
    for (const resolve of this.next_queue) {
      resolve(done_result);
    }
    this.next_queue = [];
  }

  async next() {
    const value = this.push_queue.shift();
    if (value !== undefined) {
      return { done: false, value };
    }
    if (this.ended) {
      return done_result;
    }
    return new Promise<IteratorResult<T>>((resolve) => {
      this.next_queue.push(resolve);
    });
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

// 2.2.6 Mnemonics
export class BitReader {
  private offset = 0;
  constructor(private buffer: Uint8Array) { }
  private msb() {
    const byte = this.buffer[this.offset >>> 3];
    const bit = (byte >>> (7 - (this.offset & 7))) & 1;
    ++this.offset;
    return bit;
  }

  // Unsigned integer, most significant bit first
  uimsbf(n: number) {
    if (n > 53) throw new Error('n must be <= 53');
    if (this.offset + n > this.buffer.length * 8) throw new UnexpectedEOFError;
    let value = 0;
    for (let i = 0; i < n; i++) {
      // TODO: optimize
      value = (value * 2) + this.msb();
    }
    return value;
  }

  // Bit string, left bit first
  bslbf(n: number) {
    // represented as binary number
    return this.uimsbf(n);
  }

  // Two's complement integer, msb (sign) bit first
  tcimsbf(n: number) {
    if (n > 53) throw new Error('n must be <= 53');
    if (this.offset + n > this.buffer.length * 8) throw new UnexpectedEOFError;
    let value = 0;
    let negative = false;
    for (let i = 0; i < n; i++) {
      // TODO: optimize
      const bit = this.msb();
      if (i === 0 && bit === 1) {
        negative = true;
      }
      value = (value * 2) + (negative ? bit ^ 1 : bit);
    }
    if (negative) {
      value = -(value + 1);
    }
    return value;
  }

  check_byte_aligned() {
    if (this.offset & 7) throw new ByteNotAlignedError;
  }

  bytes(n: number) {
    this.check_byte_aligned();
    if ((this.offset >>> 3) + n > this.buffer.length) throw new UnexpectedEOFError;
    const buffer = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      buffer[i] = this.buffer[this.offset >>> 3];
      this.offset += 8;
    }
    return buffer;
  }

  tell() {
    return this.offset;
  }
}
