/**
 * Module dependencies.
 */

import assert from 'assert';
import Parser from '../index.js';
import { Transform } from 'stream';

describe('Transform stream', function () {

  it('should have the `_bytes()` function', function () {
    const t = new Transform();
    Parser(t);
    assert.equal('function', typeof t._bytes);
  });

  it('should have the `_skipBytes()` function', function () {
    const t = new Transform();
    Parser(t);
    assert.equal('function', typeof t._skipBytes);
  });

  it('should have the `_passthrough()` function', function () {
    const t = new Transform();
    Parser(t);
    assert.equal('function', typeof t._passthrough);
  });

  it('should read 2 bytes, pass through 2 bytes', function (done) {
    const t = new Transform();
    Parser(t);
    let gotBytes = false;
    let gotPassthrough = false;
    let gotData = false;

    // read 2 bytes
    t._bytes(2, read);
    function read (chunk, /*output*/) {
      assert.equal(2, chunk.length);
      assert.equal(0, chunk[0]);
      assert.equal(1, chunk[1]);
      gotBytes = true;
      t._passthrough(2, passthrough);
    }
    function passthrough (/*output*/) {
      gotPassthrough = true;
    }

    t.on('data', function (data) {
      assert.equal(2, data.length);
      assert.equal(2, data[0]);
      assert.equal(3, data[1]);
      gotData = true;
    });

    t.on('end', function () {
      assert(gotBytes);
      assert(gotPassthrough);
      assert(gotData);
      done();
    });

    t.end(Buffer.from([ 0, 1, 2, 3 ]));
  });

  it('should allow you to pass through Infinity bytes', function (done) {
    const t = new Transform();
    Parser(t);
    t._passthrough(Infinity);
    const out = [];
    t.on('data', function (data) {
      out.push(data);
    });
    t.on('end', function () {
      assert.equal('hello world', Buffer.concat(out).toString());
      done();
    });
    t.end('hello world');
  });

  it('should *not* allow you to buffer Infinity bytes', function () {
    // buffering to Infinity would just be silly...
    const t = new Transform();
    Parser(t);
    assert.throws(function () {
      t._bytes(Infinity);
    });
  });

  it('should not cause stack overflow', function (done) {
    // this one does an admirable amount of CPU work...
    this.test.slow(500);
    this.test.timeout(1000);

    const t = new Transform();
    Parser(t);

    let bytes = 65536;
    t._bytes(1, read);
    function read() {
      // Any downstream pipe consumer (writable) which doesn't do any async actions.
      // e.g. console.log, or simply capturing data into an in-memory data-structure.
      if (--bytes) {
        t._bytes(1, read);
      } else {
        done();
      }
    }

    const b = Buffer.alloc(bytes);
    b.fill('h');
    t.end(b);
  });

  describe('async', function () {

    it('should accept a callback function for `_passthrough()`', function (done) {
      const t = new Transform();
      let data = 'test', _data;
      Parser(t);
      t._passthrough(data.length, function (output, fn) {
        setTimeout(fn, 25);
      });

      t.on('data', function (data) {
        _data = data;
      });
      t.on('end', function () {
        assert.equal(data, _data);
        done();
      });
      t.end(data);
      t.resume();
    });

    it('should accept a callback function for `_bytes()`', function (done) {
      const t = new Transform();
      const data = 'test';
      Parser(t);
      t._bytes(data.length, function (chunk, output, fn) {
        setTimeout(fn, 25);
      });

      t.on('end', function () {
        done();
      });
      t.end(data);
      t.resume();
    });

    it('should work switching between async and sync callbacks', function (done) {
      let firstCalled, secondCalled, thirdCalled;

      // create a 6 byte Buffer. The first 4 will be the int
      // `1337`. The last 2 will be whatever...
      const val = 1337;
      const buf = Buffer.alloc(6);
      buf.writeUInt32LE(val, 0);

      const t = new Transform();
      Parser(t);

      // first read 4 bytes, with an async callback
      function first (chunk, output, fn) {
        firstCalled = true;
        assert.equal(chunk.length, 4);
        assert.equal(val, chunk.readUInt32LE(0));

        t._bytes(1, second);
        setTimeout(fn, 10);
      }

      // second read 1 byte, sync callback
      function second (chunk) {
        secondCalled = true;
        assert.equal(chunk.length, 1);
        t._bytes(1, third);
      }

      // third read 1 byte, async callback
      function third (chunk, output, fn) {
        thirdCalled = true;
        assert.equal(chunk.length, 1);
        setTimeout(fn, 10);
      }

      t.on('finish', function () {
        assert(firstCalled);
        assert(secondCalled);
        assert(thirdCalled);
        done();
      });

      t._bytes(4, first);
      t.write(buf);
      t.end();
    });

  });

});
