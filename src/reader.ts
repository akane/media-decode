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
