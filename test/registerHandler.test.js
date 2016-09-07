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


test['handler is registered by id'] = function*() {
  let handlerSpy1 = this.mocker.spy(),
    handlerSpy2 = this.mocker.spy();

  this.mgr.registerHandler('test', handlerSpy1);
  this.mgr.registerHandler('test', handlerSpy2);
  
  yield this.mgr.start();
  // this.mgr.logger = console;
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  handlerSpy1.should.not.have.been.called;
  handlerSpy2.should.have.been.called;
};


test['handler can be de-registered'] = function*() {
  let handlerSpy1 = this.mocker.spy(),
    handlerSpy2 = this.mocker.spy();

  this.mgr.registerHandler('test', handlerSpy1);
  this.mgr.deregisterHandler('test');
  
  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  handlerSpy1.should.not.have.been.called;
};

