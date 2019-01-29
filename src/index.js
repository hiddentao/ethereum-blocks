"use strict";


const DUMMY_LOGGER = {
  info: function() {},
  warn: function() {},
  error: function() {}
};


const _isPromise = function(p) {
  return (p && typeof p.then === 'function' && typeof p.catch === 'function');
};


/**
 * The block processor.
 */
class Processor {
  /**
   * Constuct a new instance.
   * 
   * @param {Object} config Configuration.
   * @param {Object} config.web3 A `Web3` instance.
   */
  constructor (config) {
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
  get isConnected () {
    return !!this._web3.isConnected();
  }


  /**
   * Get whether this processor is currently running.
   * @return {Boolean}
   */
  get isRunning () {
    return !!this._filter;
  }


  /**
   * Get the last processed block.
   * 
   * @return {Object} Block object. Or `null` if not set.
   */
  get lastBlock () {
    return this._lastBlock;
  }


  /**
   * Get the loop interval in ms.
   * @return {Number}
   */
  get loopInterval () {
    return this._loopIntervalMs;
  }
  /**
   * Set the loop interval in ms.
   * @param {Number} val
   */
  set loopInterval (val) {
    this.logger.info(`Loop interval changed: ${val}`);

    this._loopIntervalMs = val;
  }


  /**
   * Get the connection check interval in ms.
   * @return {Number}
   */
  get connectionCheckInterval () {
    return this._connectionCheckIntervalMs;
  }
  /**
   * Set the connection check interval in ms.
   * @param {Number} val
   */
  set connectionCheckInterval (val) {
    this.logger.info(`Connection check interval changed: ${val}`);
    
    this._connectionCheckIntervalMs = val;
  }



  /**
   * Get the logger.
   * @return {Object}
   */
  get logger () {
    return this._logger;
  }
  /**
   * Set the logger.
   * @param {Object} val Should have same methods as global `console` object.
   */
  set logger (val) {
    this._logger = {};
    
    for (let key in DUMMY_LOGGER) {
      this._logger[key] = (val && typeof val[key] === 'function') 
        ? val[key].bind(val)
        : DUMMY_LOGGER[key]
      ;
    }
  }
  
  
  /**
   * Stop processing blocks.
   * @return {Promise} Resolves to `true` if stopped, `false` if not running.
   */
  stop () {    
    return new Promise((resolve, reject) => {
      try {
        if (this.isRunning) {
          clearTimeout(this._loopTimeout);
          clearTimeout(this._connectionCheckTimeout);
          this._filter.stopWatching();
          this._filter = null;                  
          this._blocks = [];
          
          this.logger.info('Stopped');
          resolve(true);
        } else {
          this.logger.warn('Not currently processing');
          resolve(false);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Start processing blocks.
   *
   * @param {Object} [options] Additional options.
   * @param {String|Number} [options.catchupFromBlock] Block id or number. 
   * Catch-up from given block, processing all blocks from this one until 
   * current, before watching for, new blocks.
   * 
   * @return {Promise} Resolves to `true` if started, `false` if already running. Rejects if an error occurs.
   */
  start (options) {
    options = Object.assign({
      catchupFrom: null,
    }, options);
    
    return new Promise((resolve, reject) => {
      if (!this.isRunning) {
        this._blocks = [];
        
        this._catchupFrom(options.catchupFrom)
        .then(() => {
          return this._startFilterLoop();
        })        
        .then(resolve)
        .catch((err) => {
          this.logger.error(`Error starting: ${err.message}`);

          // cleanup
          this._filter = null;                  
          this._blocks = [];

          reject(err);
        });
      } else {
        this.logger.warn('Already running');
        
        resolve(false);
      }
    });
  }
  

  /**
   * Register a processing handler to be notified of new blocks.
   *
   * The `fn` callback should have the following signature:
   *
   *    function(eventType, blockId, data) {}
   *
   *    eventType - {String} The event type (either "block" or "error")
   *    blockId - {String} Id of block.
   *    data - {Object} Block data or error object.
   *
   * If the callback returns a Promise-like object then it will be treated as an 
   * asynchronous method, otherwise it will be treated as a synchronous method.
   * 
   * @param {String} id Unique id of handler.
   * @param {Function} fn Callback function of handler. 
   */
  registerHandler (id, fn) {
    this._handlers.set(id, fn);
    
    this.logger.info(`Registered handler: ${id}`);
  }
  
  /**
   * Deregister a previously registered processing handler.
   * @param {String} id Unique id of handler.
   */
  deregisterHandler (id) {
    this._handlers.delete(id);
    
    this.logger.info(`Deregistered handler: ${id}`);
  }

  /**
   * Catch-up with all blocks which have taken place since given block.
   *
   * This method usually gets executed from `start()` before the 
   * block-watching filter gets setup. Internally it will work out which blocks 
   * have appeared AFTER the given one (based on block number differences) and 
   * then add all the relevant numbers to the `this._blocks` array. This makes 
   * the assumption that block numbers are strictly sequential, which is 
   * usually the case unless you're running a private network with extremely 
   * low mining difficulty.
   *
   * @param {Number|String} blockIdOrNumber Block id or number.
   *
   * @return {Promise} Resolves once done.
   */
  _catchupFrom (blockIdOrNumber) {
    return new Promise((resolve, reject) => {
      if (null === blockIdOrNumber || undefined === blockIdOrNumber) {
        this.logger.info('No catch-up block specified, skipping catch-up');
        
        return resolve();
      }
      
      // first lets get this block
      this._web3.eth.getBlock(blockIdOrNumber, (err, startBlock) => {
        if (err) {
          return reject(new Error(`Unable to fetch block ${blockIdOrNumber}: ${err.message}`));
        }
        
        if (!startBlock) {
          return reject(new Error(`Catch-up starting block invalid: ${blockIdOrNumber}`));
        }
        
        const startBlockNum = startBlock.number;
        
        // now get latest block number
        this._web3.eth.getBlockNumber((err, blockNum) => {
          if (err) {
            return reject(new Error('Unable to fetch latest block number.'));
          }
          
          // now let's add the differences
          for (let i=startBlockNum+1; blockNum>=i; ++i) {
            this._blocks.push(i);
          }

          this.logger.info(`Need to catch-up with ${blockNum - startBlockNum} blocks`);
          
          resolve();
        });
      });
    });
  }


  /**
   * Start filter loop.
   *
   * @return {Promise}
   */
  _startFilterLoop () {
    return new Promise((resolve) => {
      this._filter = this._web3.eth.filter('latest');
      // need this delay here otherwise when the filter callback gets called, 
      // this._filter may not be set yet. Usually happens if we're mining too 
      // quickly on a private blockchain.
      setTimeout(() => {
        this._filter.watch(this._filterCallback);
        
        this.logger.info('Started');
        this._loop();
        
        this.logger.info('Filter loop started');
        
        resolve(true);
      }, 0);      
    });
  }
  
  
  /**
   * Wait for the connection to return.
   */
  _waitForConnection () {
    // if connected again!
    if (this.isConnected) {
      this.logger.info('Connection re-established');
      
      // if we were running previously then re-start the filter loop again
      if (this.isRunning) {
        return this._startFilterLoop();
      }
    } else {
      this._connectionCheckTimeout = setTimeout(this._waitForConnection, this.connectionCheckInterval);
    }
  }


  /**
   * Inner loop to process blocks.
   */
  _loop () {
    if (!this.isRunning) {
      this.logger.warn('Not running, so exiting loop');
      
      return;
    }

    // if not connected
    if (!this.isConnected) {
      this.logger.warn('Connection lost, waiting for connection');
      
      return this._waitForConnection();
    }
        
    new Promise((resolve) => {
      const numBlocks = this._blocks.length;
      
      if (!numBlocks) {
        return resolve();
      }
      
      this.logger.info(`Got ${numBlocks} block(s) to process`);
        
      // remove blocks from backlog array
      const blockIds = this._blocks.splice(0, numBlocks);
      
      let __nextBlock = () => {
        if (!blockIds.length) {
          return resolve();
        }
        
        this._processBlock(blockIds.shift()).then(__nextBlock);
      };
      __nextBlock();
      
    })
    .then(() => {
      if (!this.isRunning) {
        this.logger.warn('Not running, so exiting loop');
        
        return;
      }
        
      this._loopTimeout = setTimeout(this._loop, this.loopInterval);
    });    
  }


  /**
   * Process given block.
   * @param {String|Number} blockIdOrNumber Block hash or number.
   * @return {Promise}
   */
  _processBlock (blockIdOrNumber) {
    return new Promise((resolve, reject) => {
      this.logger.info(`Fetching block ${blockIdOrNumber}`);
      
      this._web3.eth.getBlock(blockIdOrNumber, true, (err, block) => {
        if (err) {
          return reject(err);
        } else {
          return resolve(block);
        }
      });
    })
    .then((block) => {
      if (!block) {
        throw new Error(`Invalid block id: ${blockIdOrNumber}`);
      }
      
      this.logger.info(`Processing block #${block.number}: ${block.hash} ...`);

      return this._invokeHandlers('block', block.hash, block)
      .then(() => {
        this.logger.info(`... done processing block #${block.number}: ${block.hash}`);      
        
        this._lastBlock = block;
      });
    })
    .catch((err) => {
      this.logger.error(err);
      
      return this._invokeHandlers('error', null, err);
    });
  }

  /**
   * Callback handler for web3.filter().
   *
   * @param {Error} err If any error occurred.
   * @param {*} result Filter result, usually a block hash.
   */
  _filterCallback (err, result) {
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
  
  
  /**
   * Invoke registered handlers.
   *
   * @param {String} eventType The event type.
   * @param {String} blockId Block hash.
   * @param {Object} data Data to pass along.
   *
   * @return {Promise} Resolves once all handlers have executed.
   */
  _invokeHandlers (eventType, blockId, data) {
    return new Promise((resolve) => {
      let todo = this._handlers.size;
      
      if (!todo) {
        this.logger.info(`No handlers registered to invoke.`);

        return resolve();
      }
      
      const done = (err, id) => {
        if (err) {
          this.logger.error(`Handler '${id}' errored for invocation: ${err.message}`);
        } else {
          this.logger.info(`Invoked handler '${id}'`);
        }
    
        todo--;
        if (!todo) {
          this.logger.info(`Finished invoking handlers for ${eventType} event on block ${blockId}`);
          
          resolve();
        }
      }
    
      this.logger.info(`Going to invoke ${todo} handlers for ${eventType} event on block ${blockId}...`);
      
      this._handlers.forEach((fn, id) => {
        try {
          let promise = fn(eventType, blockId, data);
          
          if (_isPromise(promise)) {
            promise
            .then(() => done(null, id))
            .catch((err) => done(err, id))
          } else {
            done(null, id);
          }
        } catch (err) {
          done(err, id);
        }        
      });
    });
  }
}


module.exports = Processor;
