"use strict";

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
  
  let spy = this.mocker.spy((eventType, blockId, block) => {
    lastBlock = block;
  });
  
  this.mgr.registerHandler('test', spy);
  
  yield this.mgr.start();
  
  // wait until we get a block twice
  yield this.waitUntilNextBlock();
  yield this.waitUntilNextBlock();
  
  yield this.stopMining();
  yield this.mgr.stop();
  
  lastBlock.hash.should.eql(this.mgr.lastBlock.hash);
};
