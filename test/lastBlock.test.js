"use strict";

const _ = require('lodash'),
  Q = require('bluebird');

const test = require('./_base')(module);

test.before = function*() {
  yield this.startGeth();
  yield this.startMining();
};


test.after = function*() {
  yield this.stopGeth();
};


test.beforeEach = function*() {
  this.mgr = new this.Manager({
    web3: this.web3,
  });
};


test['no last block by default'] = function*() {
  this.expect(this.mgr.lastBlock).to.be.null;
};


test['keeps track of last block processed'] = function*() {
  let lastBlock;
  
  this.mgr.registerHandler('test', function(eventType, blockId, data) {
    if ('block' === eventType) {
      lastBlock = data;
    } else {
      console.error(data);
    }
  });
  
  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  yield this.stopMining();

  yield Q.delay(this.mgr.loopInterval * 1.5);
  yield this.mgr.stop();
  
  _.get(lastBlock, 'hash', '').should.eql(_.get(this.mgr.lastBlock, 'hash'));
};
