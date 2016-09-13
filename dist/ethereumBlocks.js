(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(['module'], factory);
  } else if (typeof exports !== "undefined") {
    factory(module);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod);
    global.EthereumBlocks = mod.exports;
  }
})(this, function (module) {
  "use strict";

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  var _createClass = function () {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  }();

  var DUMMY_LOGGER = {
    info: function info() {},
    warn: function warn() {},
    error: function error() {}
  };

  var _isPromise = function _isPromise(p) {
    return p && typeof p.then === 'function' && typeof p.catch === 'function';
  };

  /**
   * The block processor.
   */

  var Processor = function () {
    /**
     * Constuct a new instance.
     * 
     * @param {Object} config Configuration.
     * @param {Object} config.web3 A `Web3` instance.
     */
    function Processor(config) {
      _classCallCheck(this, Processor);

      this._config = config;
      this._web3 = config.web3;

      this._blocks = [];
      this._lastBlock = null;
      this._handlers = new Map();

      this._filterCallback = this._filterCallback.bind(this);
      this._loop = this._loop.bind(this);
      this._waitForConnection = this._waitForConnection.bind(this);

      this._logger = DUMMY_LOGGER;
      this._loopIntervalMs = 5000;
      this._connectionCheckIntervalMs = 5000;
    }

    /**
     * Get whether this processor is connected to the node.
     * @return {Boolean}
     */


    _createClass(Processor, [{
      key: 'stop',
      value: function stop() {
        var _this = this;

        return new Promise(function (resolve, reject) {
          try {
            if (_this.isRunning) {
              clearTimeout(_this._loopTimeout);
              clearTimeout(_this._connectionCheckTimeout);
              _this._filter.stopWatching();
              _this._filter = null;
              _this._blocks = [];

              _this.logger.info('Stopped');
              resolve(true);
            } else {
              _this.logger.warn('Not currently processing');
              resolve(false);
            }
          } catch (err) {
            reject(err);
          }
        });
      }
    }, {
      key: 'start',
      value: function start(options) {
        var _this2 = this;

        options = Object.assign({
          catchupFrom: null
        }, options);

        return new Promise(function (resolve, reject) {
          if (!_this2.isRunning) {
            _this2._blocks = [];

            _this2._catchupFrom(options.catchupFrom).then(function () {
              return _this2._startFilterLoop();
            }).then(resolve).catch(function (err) {
              _this2.logger.error('Error starting: ' + err.message);

              // cleanup
              _this2._filter = null;
              _this2._blocks = [];

              reject(err);
            });
          } else {
            _this2.logger.warn('Already running');

            resolve(false);
          }
        });
      }
    }, {
      key: 'registerHandler',
      value: function registerHandler(id, fn) {
        this._handlers.set(id, fn);

        this.logger.info('Registered handler: ' + id);
      }
    }, {
      key: 'deregisterHandler',
      value: function deregisterHandler(id) {
        this._handlers.delete(id);

        this.logger.info('Deregistered handler: ' + id);
      }
    }, {
      key: '_catchupFrom',
      value: function _catchupFrom(blockIdOrNumber) {
        var _this3 = this;

        return new Promise(function (resolve, reject) {
          if (null === blockIdOrNumber || undefined === blockIdOrNumber) {
            _this3.logger.info('No catch-up block specified, skipping catch-up');

            return resolve();
          }

          // first lets get this block
          _this3._web3.eth.getBlock(blockIdOrNumber, function (err, startBlock) {
            if (err) {
              return reject(new Error('Unable to fetch block ' + blockIdOrNumber + ': ' + err.message));
            }

            if (!startBlock) {
              return reject(new Error('Catch-up starting block invalid: ' + blockIdOrNumber));
            }

            var startBlockNum = startBlock.number;

            // now get latest block number
            _this3._web3.eth.getBlockNumber(function (err, blockNum) {
              if (err) {
                return reject(new Error('Unable to fetch latest block number.'));
              }

              // now let's add the differences
              for (var i = startBlockNum + 1; blockNum >= i; ++i) {
                _this3._blocks.push(i);
              }

              _this3.logger.info('Need to catch-up with ' + (blockNum - startBlockNum) + ' blocks');

              resolve();
            });
          });
        });
      }
    }, {
      key: '_startFilterLoop',
      value: function _startFilterLoop() {
        var _this4 = this;

        return new Promise(function (resolve) {
          _this4._filter = _this4._web3.eth.filter('latest');
          // need this delay here otherwise when the filter callback gets called, 
          // this._filter may not be set yet. Usually happens if we're mining too 
          // quickly on a private blockchain.
          setTimeout(function () {
            _this4._filter.watch(_this4._filterCallback);

            _this4.logger.info('Started');
            _this4._loop();

            _this4.logger.info('Filter loop started');

            resolve(true);
          }, 0);
        });
      }
    }, {
      key: '_waitForConnection',
      value: function _waitForConnection() {
        // if connected again!
        if (this.isConnected) {
          this.logger.info('Connection re-established');

          // if we were running previously then re-start the filter loop again
          if (this.isRunning) {
            return this._startFilterLoop();
          }
        } else {
          this._connectionCheckTimeout = etTimeout(this._waitForConnection, this.connectionCheckInterval);
        }
      }
    }, {
      key: '_loop',
      value: function _loop() {
        var _this5 = this;

        if (!this.isRunning) {
          this.logger.warn('Not running, so exiting loop');

          return;
        }

        // if not connected
        if (!this.isConnected) {
          this.logger.warn('Connection lost, waiting for connection');

          return this._waitForConnection();
        }

        new Promise(function (resolve) {
          var numBlocks = _this5._blocks.length;

          if (!numBlocks) {
            return resolve();
          }

          _this5.logger.info('Got ' + numBlocks + ' block(s) to process');

          // remove blocks from backlog array
          var blockIds = _this5._blocks.splice(0, numBlocks);

          var blocksProcessed = 0;

          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = blockIds[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var blockId = _step.value;

              _this5._processBlock(blockId).then(function () {
                blocksProcessed++;
                if (numBlocks <= blocksProcessed) {
                  resolve();
                }
              });
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }
        }).then(function () {
          if (!_this5.isRunning) {
            _this5.logger.warn('Not running, so exiting loop');

            return;
          }

          _this5._loopTimeout = setTimeout(_this5._loop, _this5.loopInterval);
        });
      }
    }, {
      key: '_processBlock',
      value: function _processBlock(blockIdOrNumber) {
        var _this6 = this;

        return new Promise(function (resolve, reject) {
          _this6.logger.info('Fetching block ' + blockIdOrNumber);

          _this6._web3.eth.getBlock(blockIdOrNumber, true, function (err, block) {
            if (err) {
              return reject(err);
            } else {
              return resolve(block);
            }
          });
        }).then(function (block) {
          if (!block) {
            throw new Error('Invalid block id: ' + blockIdOrNumber);
          }

          _this6.logger.info('Processing block #' + block.number + ': ' + block.hash + ' ...');

          return _this6._invokeHandlers('block', block.hash, block).then(function () {
            _this6.logger.info('... done processing block #' + block.number + ': ' + block.hash);

            _this6._lastBlock = block;
          });
        }).catch(function (err) {
          _this6.logger.error(err);

          return _this6._invokeHandlers('error', block.hash, err);
        });
      }
    }, {
      key: '_filterCallback',
      value: function _filterCallback(err, result) {
        this.logger.info('Got filter callback');

        if (err) {
          return this.logger.error('Got error from filter', err);
        }

        // if not running then skip
        if (!this.isRunning) {
          this.logger.warn('Not currently running, so skipping block');

          return;
        }

        this._blocks.push(result);
      }
    }, {
      key: '_invokeHandlers',
      value: function _invokeHandlers(eventType, blockId, data) {
        var _this7 = this;

        return new Promise(function (resolve) {
          var todo = _this7._handlers.size;

          if (!todo) {
            _this7.logger.info('No handlers registered to invoke.');

            return resolve();
          }

          var done = function done(err, id) {
            if (err) {
              _this7.logger.error('Handler \'' + id + '\' errored for invocation: ' + err.message);
            } else {
              _this7.logger.info('Invoked handler \'' + id + '\'');
            }

            todo--;
            if (!todo) {
              _this7.logger.info('Finished invoking handlers for ' + eventType + ' event on block ' + blockId);

              resolve();
            }
          };

          _this7.logger.info('Going to invoke ' + todo + ' handlers for ' + eventType + ' event on block ' + blockId + '...');

          _this7._handlers.forEach(function (fn, id) {
            try {
              var promise = fn(eventType, blockId, data);

              if (_isPromise(promise)) {
                promise.then(function () {
                  return done(null, id);
                }).catch(function (err) {
                  return done(err, id);
                });
              } else {
                done(null, id);
              }
            } catch (err) {
              done(err, id);
            }
          });
        });
      }
    }, {
      key: 'isConnected',
      get: function get() {
        return !!this._web3.isConnected();
      }
    }, {
      key: 'isRunning',
      get: function get() {
        return !!this._filter;
      }
    }, {
      key: 'lastBlock',
      get: function get() {
        return this._lastBlock;
      }
    }, {
      key: 'loopInterval',
      get: function get() {
        return this._loopIntervalMs;
      },
      set: function set(val) {
        this.logger.info('Loop interval changed: ' + val);

        this._loopIntervalMs = val;
      }
    }, {
      key: 'connectionCheckInterval',
      get: function get() {
        return this._connectionCheckIntervalMs;
      },
      set: function set(val) {
        this.logger.info('Connection check interval changed: ' + val);

        this._connectionCheckIntervalMs = val;
      }
    }, {
      key: 'logger',
      get: function get() {
        return this._logger;
      },
      set: function set(val) {
        this._logger = {};

        for (var key in DUMMY_LOGGER) {
          this._logger[key] = val && typeof val[key] === 'function' ? val[key].bind(val) : DUMMY_LOGGER[key];
        }
      }
    }]);

    return Processor;
  }();

  module.exports = Processor;
});

