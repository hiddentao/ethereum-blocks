"use strict";

const Q = require('bluebird');

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


test['handler gets passed blocks'] = function*() {
  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  const startingBlockNumber = this.web3.eth.blockNumber;
  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval);
  
  spy.should.have.been.called;
  spy.should.have.been.calledWith('block');
  
  // ensure handler got called with all blocks since
  let blocksSeenSince = this.web3.eth.blockNumber - startingBlockNumber;
  this.expect(spy.callCount >= blocksSeenSince).to.be.true;
  
  // check first block
  let args = spy.getCall(0).args;
  let blockId = args[1];
  
  let block = yield this.getBlock(blockId);
  block.nonce.should.eql(args[2].nonce);
};



