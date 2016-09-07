"use strict";

const Q = require('bluebird');

const test = require('./_base')(module);

test.before = function*() {
  yield this.startGeth();
};


test.after = function*() {
  yield this.stopGeth();
};


test.beforeEach = function*() {
  this.mgr = new this.Manager({
    web3: this.web3,
  });
};


test['will auto-reconnect if connection is lost'] = function*() {
  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  // this.mgr.logger = console;
  
  yield this.mgr.start();
  
  yield this.stopGeth();
  
  // still running
  this.mgr.isRunning.should.be.true;
  // not connected
  this.mgr.isConnected.should.be.false;
  
  yield Q.delay(this.mgr.loopInterval * 1.5);

  yield this.startGeth();
  yield this.startMining();
  
  yield Q.delay(this.mgr.connectionCheckInterval * 1.5);

  // running
  this.mgr.isRunning.should.be.true;
  // is connected
  this.mgr.isConnected.should.be.true;
  
  const lastBlockNum = yield this.waitUntilNextBlock();
  yield this.stopMining();

  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  spy.should.have.been.called;
  spy.args.pop()[2].number.should.eql(lastBlockNum);
};




test['if reconnect interval is too large it will not do it in time'] = function*() {
  let spy = this.mocker.spy();
  
  this.mgr.registerHandler('test', spy);
  
  // this.mgr.logger = console;
  // 
  this.mgr.connectionCheckInterval = 60000;
  
  yield this.mgr.start();
  
  yield this.stopGeth();
  
  // still running
  this.mgr.isRunning.should.be.true;
  // not connected
  this.mgr.isConnected.should.be.false;
  
  yield Q.delay(this.mgr.loopInterval * 1.5);

  yield this.startGeth();
  yield this.startMining();
  
  yield Q.delay(this.mgr.loopInterval * 2);

  // running
  this.mgr.isRunning.should.be.true;
  // is connected
  this.mgr.isConnected.should.be.true;
  
  const lastBlockNum = yield this.waitUntilNextBlock();
  yield this.stopMining();

  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  spy.should.not.have.been.called;
};

