/**
 * Module dependencies.
 */

import Parser from '../index.js';
import assert from 'assert';
import { inherits } from 'util';
import { Writable } from 'stream';

describe('Writable streams', function () {

  const val = 1337;
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(val, 0);

  it('should have the `_bytes()` function', function () {
    const w = new Writable();
    Parser(w);
    assert.equal('function', typeof w._bytes);
  });

  it('should have the `_skipBytes()` function', function () {
    const w = new Writable();
    Parser(w);
    assert.equal('function', typeof w._skipBytes);
  });

  it('should *not* have the `_passthrough()` function', function () {
    const w = new Writable();
    Parser(w);
    assert.notEqual('function', typeof w._passthrough);
  });

  it('should read 4 bytes in one chunk', function (done) {
    const w = new Writable();
    Parser(w);

    // read 4 bytes
    w._bytes(4, function (chunk) {
      assert.equal(chunk.length, buf.length);
      assert.equal(val, chunk.readUInt32LE(0));
      done();
    });

    w.end(buf);
  });

  it('should read 4 bytes in multiple chunks', function (done) {
    const w = new Writable();
    Parser(w);

    // read 4 bytes
    w._bytes(4, function (chunk) {
      assert.equal(chunk.length, buf.length);
      assert.equal(val, chunk.readUInt32LE(0));
      done();
    });

    for (let i = 0; i < buf.length; i++) {
      w.write(Buffer.from([ buf[i] ]));
    }
    w.end();
  });

  it('should read 1 byte, 2 bytes, then 3 bytes', function (done) {
    const w = new Writable();
    Parser(w);

    // read 1 byte
    w._bytes(1, readone);
    function readone (chunk) {
      assert.equal(1, chunk.length);
      assert.equal(0, chunk[0]);
      w._bytes(2, readtwo);
    }
    function readtwo (chunk) {
      assert.equal(2, chunk.length);
      assert.equal(0, chunk[0]);
      assert.equal(1, chunk[1]);
      w._bytes(3, readthree);
    }
    function readthree (chunk) {
      assert.equal(3, chunk.length);
      assert.equal(0, chunk[0]);
      assert.equal(1, chunk[1]);
      assert.equal(2, chunk[2]);
      done();
    }

    w.end(Buffer.from([ 0, 0, 1, 0, 1, 2 ]));
  });

  it('should work when mixing in to a subclass\' `prototype`', function (done) {
    function MyWritable () {
      Writable.call(this);
      this._bytes(2, this.onbytes);
    }
    inherits(MyWritable, Writable);

    // mixin to the `prototype`
    Parser(MyWritable.prototype);

    let count = 2;
    MyWritable.prototype.onbytes = function (buf) {
      assert.equal(2, buf.length);
      assert.equal(0, buf[0]);
      assert.equal(1, buf[1]);
      --count;
      if (!count) done();
    };

    const a = new MyWritable();
    const b = new MyWritable();

    // interleave write()s
    a.write(Buffer.from([ 0 ]));
    b.write(Buffer.from([ 0 ]));
    a.write(Buffer.from([ 1 ]));
    b.write(Buffer.from([ 1 ]));
    a.end();
    b.end();
  });

  it('should *not* allow you to buffer Infinity bytes', function () {
    // buffering to Infinity would just be silly...
    const w = new Writable();
    Parser(w);
    assert.throws(function () {
      w._bytes(Infinity);
    });
  });

  it('should skip 3 bytes then buffer 3 bytes', function (done) {
    const w = new Writable();
    Parser(w);

    w._skipBytes(3, function () {
      assert.equal(arguments.length, 0);
      w._bytes(3, function (data) {
        assert.equal(arguments.length, 1);
        assert.equal(data.toString('ascii'), 'lo\n');
        done();
      });
    });

    w.end('hello\n');
  });

  describe('async', function () {

    it('should accept a callback function for `_bytes()`', function (done) {
      const w = new Writable();
      const data = 'test';
      Parser(w);
      w._bytes(data.length, function (chunk, fn) {
        setTimeout(fn, 25);
      });
      w.on('finish', function () {
        done();
      });
      w.end(data);
    });

    it('should emit an "error" event when data is written with no parsing function', function (done) {
      const w = new Writable();
      Parser(w);
      w.once('error', function (err) {
        assert(err);
        done();
      });
      w.write('a');
    });

  });

  describe('FrameParser', function () {
    function FrameParser () {
      Writable.call(this);
      this._bytes(1, this.onsize);
    }
    inherits(FrameParser, Writable);

    // mixin to the `prototype`
    Parser(FrameParser.prototype);

    FrameParser.prototype.onsize = function (buf) {
      const size = buf.readUInt8(0);
      this._bytes(size, this.onframe);
    };

    FrameParser.prototype.onframe = function (buf) {
      this.emit('frame', buf.toString());

      // begin parsing the next "frame"
      this._bytes(1, this.onsize);
    };

    it('should emit 1 "frame" event', function (done) {
      const p = new FrameParser();
      const s = 'a string';
      p.on('frame', function (frame) {
        assert.equal(s, frame);
        done();
      });
      p.write(Buffer.from([ s.length ]));
      p.write(Buffer.from(s));
      p.end();
    });

    it('should emit 2 "frame" events', function (done) {
      const p = new FrameParser();
      const s = 'a string';
      const s2 = 'done';
      let count = 0;
      p.on('frame', function (frame) {
        count++;
        if (s2 == frame) {
          assert.equal(2, count);
          done();
        }
      });
      p.write(Buffer.from([ s.length ]));
      p.write(Buffer.from(s));
      p.write(Buffer.from([ s2.length ]));
      p.write(Buffer.from(s2));
      p.end();
    });

  });

});
