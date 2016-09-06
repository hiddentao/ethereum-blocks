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


test['catch-up block is invalid'] = function*() {
  try {
    yield this.mgr.start({
      catchupFrom: 'invalid'
    });        
    
    throw -1;
  } catch (err) {
    err.message.should.eql('Catch-up starting block invalid: invalid');
  }
};




test['no catch up by default'] = function*() {
  yield this.waitUntilNextBlock();
  yield this.stopMining();

  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  let blockNumber = this.web3.eth.blockNumber;
  
  yield this.mgr.start();
  yield this.startMining();
  
  yield this.waitUntilNextBlock();
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  yield this.mgr.stop();

  spy.should.have.been.called;
  spy.args[0][2].number.should.be.gt(blockNumber);
};


test['no catch up if given null'] = function*() {
  yield this.waitUntilNextBlock();
  yield this.stopMining();

  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  let blockNumber = this.web3.eth.blockNumber;
  
  yield this.mgr.start({
    catchupFrom: null,
  });
  yield this.startMining();
  
  yield this.waitUntilNextBlock();
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  yield this.mgr.stop();

  spy.should.have.been.called;
  spy.args[0][2].number.should.be.gt(blockNumber);
};


test['no catch up if given undefined'] = function*() {
  yield this.waitUntilNextBlock();
  
  yield this.stopMining();
  
  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  let blockNumber = this.web3.eth.blockNumber;
  
  yield this.mgr.start({
    catchupFrom: undefined,
  });
  
  yield this.startMining();

  yield this.waitUntilNextBlock();
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  yield this.mgr.stop();

  spy.should.have.been.called;
  spy.args[0][2].number.should.be.gt(blockNumber);
};




test['no catch up possible'] = function*() {
  yield this.waitUntilNextBlock();

  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  let blockNumber = this.web3.eth.blockNumber;
  
  yield this.mgr.start({
    catchupFrom: blockNumber
  });

  yield this.waitUntilNextBlock();
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  yield this.mgr.stop();

  spy.should.have.been.called;
  spy.args[0][2].number.should.be.gt(blockNumber);
};



test['catch up possible'] = function*() {  
  /*
  We need a higher mining difficulty to help guarantee that blocks are in order.
   */
  yield this.stopGeth();
  yield this.startGeth({
    genesisBlock: {
      difficulty: '0xFF',
    }
  });
 
 const startingBlockNumber = this.web3.eth.blockNumber;

  let i = 2;
  while (i--) {
    yield this.startMining();
    yield this.waitUntilNextBlock();
    yield this.stopMining();
  }
  
  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  // this.mgr.logger = console;
  
  const currentBlockNum = this.web3.eth.blockNumber;
  
  console.log(
    'try catching up from ' + startingBlockNumber + ' to ' + currentBlockNum
  );

  yield this.mgr.start({
    catchupFrom: startingBlockNumber
  });

  yield Q.delay(this.mgr.loopInterval * 2);
  
  yield this.mgr.stop();
  
  spy.should.have.been.called;
  
  // find highest block number
  const highestBlockNum = spy.args.reduce((m, v) => {
    return (v[2].number > m) ? v[2].number : m;
  }, 0);
  
  highestBlockNum.should.eql(currentBlockNum);
};
