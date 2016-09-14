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


test['blocks are processed 1-by-1 in order'] = function*() {
  const blocks = [],
    log = [];
  
  // stub processing call
  let processSpy = this.mocker.stub(this.mgr, '_processBlock', (blockId) => {
    blocks.push(blockId);
    log.push(`started ${blockId}`);
    return Q.delay(20000 /* this delay ensures blocks will get queued up! */)
    .then(() => {
      log.push(`finished ${blockId}`);
    })
  });


  // start
  yield this.mgr.start();
  
  // wait until we get atleast 4 blocks
  yield this.waitUntilNextBlock();
  yield this.waitUntilNextBlock();
  yield this.waitUntilNextBlock();
  yield this.waitUntilNextBlock();
  
  // wait for processor to kick in
  yield Q.delay(this.mgr.loopInterval * 1.5);

  // start
  yield this.mgr.stop();

  // wait for processing to complete
  yield Q.delay(25000);

  console.log(`Blocks processed: ${blocks.length}`);
  
  // check processing order
  const check = [];
  blocks.forEach((blockId) => {
    check.push(`started ${blockId}`);
    check.push(`finished ${blockId}`);
  });
  log.should.eql(check.slice(0, log.length));
};

