"use strict";

const test = require('./_base')(module);

test.beforeEach = function*() {
  this.mgr = new this.Manager({});
}



test['nothing by default'] = function*() {
  let spy = this.mocker.spy(console, 'info');
  
  this.mgr.registerHandler('test', function() {});
  
  spy.should.not.have.been.called;
};


test['turn on and off'] = function*() {
  let spy = this.mocker.spy();
  
  this.mgr.logger = {
    info: spy,
  };

  this.mgr.registerHandler('test', function() {});

  spy.should.have.been.calledWithExactly(`Registered handler: test`);
  
  this.mgr.logger = null;

  this.mgr.registerHandler('test2', function() {});
  
  spy.callCount.should.eql(1);
};



test['must be valid logger'] = function*() {
  let spy = this.mocker.spy();
  
  this.mgr.logger = 'blah';
  
  this.mgr.registerHandler('test', function() {});
};



