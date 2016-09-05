"use strict";

const test = require('./_base')(module);


test['nothing by default'] = function*() {
  let mgr = new this.Manager({});
  
  let spy = this.mocker.spy(console, 'info');
  
  mgr.registerHandler('test', function() {});
  
  spy.should.not.have.been.called;
};


test['turn on and off'] = function*() {
  let spy = this.mocker.spy();
  
  let mgr = new this.Manager({});
  mgr.logger = {
    info: this.mocker.spy(),
  };
  
  mgr.registerHandler('test', function() {});

  spy.should.have.been.calledWithExactly(`Registered handler: test`);
  
  mgr.logger = null;

  mgr.registerHandler('test2', function() {});
  
  spy.callCount.should.eql(1);
};



test['must be valid logger'] = function*() {
  let spy = this.mocker.spy();
  
  let mgr = new this.Manager({});
  mgr.logger = 'blah';
  
  mgr.registerHandler('test', function() {});
};



