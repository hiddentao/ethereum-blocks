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


test['handler gets passed blocks'] = function*() {
  let spy = this.mocker.spy();
    
  this.mgr.registerHandler('test', spy);
  
  const startingBlockNumber = this.web3.eth.blockNumber;
  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  spy.should.have.been.called;
  spy.should.have.been.calledWith('block');
  
  // check first block
  let args = spy.getCall(0).args;
  let blockId = args[1];
  
  let block = yield this.getBlock(blockId);
  block.nonce.should.eql(args[2].nonce);
};



test['handler error does not affect other handlers'] = function*() {
  let spies = [],
    invoked = [];
    
  for (let i=0; 10>i; ++i) {
    let spy = this.mocker.spy(() => {
      invoked.push(i);
      if (5 === i) {
        throw new Error('crashed!');
      }
    });
    
    spies.push(spy);
    
    this.mgr.registerHandler(`spy${i}`, spy);
  }
  
  let errorSpy = this.mocker.spy();
  
  this.mgr.logger = {
    error: errorSpy
  };
  
  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  // all invoked
  invoked.length.should.be.gt(0);
  (invoked.length % spies.length).should.eql(0);
  // order
  invoked.slice(0,10).should.eql([0,1,2,3,4,5,6,7,8,9]);
  
  // error call
  errorSpy.should.have.been.calledOnce;
  errorSpy.getCall(0).args[0].should.contain(`Handler 'spy5' errored for invocation`);
};



test['a handler can be asynchronous'] = function*() {
  let logSpy = this.mocker.spy();
  this.mgr.logger = {
    info: logSpy,
    // error: console.error.bind(console),
  };

  let handler1 = this.mocker.spy(),
    handler2 = this.mocker.spy(() => {
      return Q.delay(30000);
    });
        
  this.mgr.registerHandler(`sync`, handler1);
  this.mgr.registerHandler(`async`, handler2);

  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  handler1.should.have.been.called;
  handler1.should.have.been.calledWith('block');
  
  handler2.should.have.been.called
  handler2.should.have.been.calledWith('block');

  // because the async handler takes forever to complete the block processing
  // does not complete in time.
  for (let logline of _.flatten(logSpy.args)) {
    logline.should.not.contain('done processing block');
  }
};




test['asynchronous handler errors are handled gracefully too'] = function*() {
  let logSpy = this.mocker.spy();
  this.mgr.logger = {
    error: logSpy,
    // error: console.error.bind(console),
  };

  let handler1 = this.mocker.spy(),
    handler2 = this.mocker.spy(() => {
      return Promise.reject(new Error('oh dear!'));
    });
        
  this.mgr.registerHandler(`sync`, handler1);
  this.mgr.registerHandler(`async`, handler2);

  yield this.mgr.start();
  
  // wait until we get a block
  yield this.waitUntilNextBlock();
  // wait for processor to do its biz
  yield Q.delay(this.mgr.loopInterval * 1.5);
  
  let logs = _.flatten(logSpy.args);
  logs.join('').should.contain(`Handler 'async' errored for invocation: oh dear!`);
};






