"use strict";

const test = require('./_base')(module);


test['nothing by default'] = function*() {
  let mgr = new this.Manager({});
  
  let spy = this.mocker.spy(console, 'info');
  
  mgr.registerHandler('test', function() {});
  
  spy.should.not.have.been.called;
};


test['set to custom'] = function*() {
  let spy = this.mocker.spy();
  
  let mgr = new this.Manager({
    logger: {
      info: spy,
    }
  });
  
  mgr.registerHandler('test', function() {});
  
  spy.should.have.been.calledWithExactly(`Registering handler: test`);
};



