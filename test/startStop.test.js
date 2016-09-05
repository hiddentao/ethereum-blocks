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
    web3: this.web3
  });
};


test['can start'] = function*() {
  (yield this.mgr.start()).should.be.true;
  this.mgr.isRunning.should.be.true;
};


test['cannot start if already running'] = function*() {
  yield this.mgr.start();
  (yield this.mgr.start()).should.be.false;
  this.mgr.isRunning.should.be.true;
};


test['can stop'] = function*() {
  yield this.mgr.start();
  (yield this.mgr.stop()).should.be.true;
  this.mgr.isRunning.should.be.false;
};


test['cannot stop if not running'] = function*() {
  (yield this.mgr.stop()).should.be.false;
  this.mgr.isRunning.should.be.false;
};


test['cannot stop if already stopped'] = function*() {
  yield this.mgr.start();
  yield this.mgr.stop();
  (yield this.mgr.stop()).should.be.false;
  this.mgr.isRunning.should.be.false;
};


test['can restart'] = function*() {
  yield this.mgr.start();
  yield this.mgr.stop();
  (yield this.mgr.start()).should.be.true;
  this.mgr.isRunning.should.be.true;
};


