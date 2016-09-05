"use strict";

// ensure we're in testing mode
process.env.NODE_ENV = 'test';

require('co-mocha'); // monkey-patch mocha

const path = require('path'),
  genomatic = require('genomatic'),
  geth = require('geth-private'),
  chai = require('chai'),
  sinon = require('sinon'),
  Web3 = require('web3');
  

chai.use(require('sinon-chai'));


const Manager = require(path.join(__dirname, '..', 'dist', 'ethereumBlocks.js'));


module.exports = function(_module) {
  const tools = {};

  tools.startGeth = function*(options) {
    this.geth = geth(_.extend({
      gethOptions: {
        rpcport: 38545,
        port: 21313
      },
    }, options));
    
    yield this.geth.start();
    
    this.web3 = new Web3(
      new Web3.providers.HttpProvider('http://localhost:38545')
    );
  };

  tools.stopGeth = function*() {
    if (this.geth) {
      yield this.geth.stop();
      this.geth = null;
    }
  };

  tools.gethExec = function*(cmd) {
    console.log(`geth exec: ${cmd}`);

    yield this.geth.consoleExec(cmd);
  };

  tools.gethStartMining = function*() {
    yield this.gethExec('miner.start();');
  }

  tools.gethStopMining = function*() {
    yield this.gethExec('miner.stop();');
  }

  const test = {
    before: function() {
      this.assert = chai.assert;
      this.expect = chai.expect;
      this.should = chai.should();
      
      this.Manager = Manager;

      for (let k in tools) {
        this[k] = genomatic.bind(tools[k], this);
      }
    },
    beforeEach: function() {
      this.mocker = sinon.sandbox.create();
    },
    afterEach: function() {
      this.mocker.restore();
    },
    tests: {},
  };

  _module.exports[path.basename(_module.filename)] = test;

  return test.tests;
};
