"use strict";


const DUMMY_LOGGER = {
  info: function() {},
  warn: function() {},
  error: function() {}
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
    this._handlers = new Set();
    
    this._filterCallback = this._filterCallback.bind(this);
    this._loop = this._loop.bind(this);
    
    this.loopInterval = 5000;
    this.logger = null;
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
    this._loopIntervalMs = val;
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
          this._filter.stopWatching();
          this._web3.reset();
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
   * @return {Promise} Resolves to `true` if started, `false` if already running.
   */
  start () {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        this._blocks = [];
        
        this._filter = this._web3.eth.filter('latest');
        
        // need this delay here otherwise when the filter callback gets called, 
        // this._filter may not be set yet. Usually happens if we're mining too 
        // quickly on a private blockchain.
        setTimeout(() => {
          this._filter.watch(this._filterCallback);
          
          this.logger.info('Started');
          this._loop();
          
          resolve(true);
          
        });
      } else {
        this.logger.warn('Already running');
        
        resolve(false);
      }
    });
  }
  

  /**
   * Register a processing handler to be notified of new blocks.
   * @param {String} id A friendly name of this handler.
   * @param {Function} fn Callback function of handler.
   */
  registerHandler (id, fn) {
    this._handlers.add({
      id: id,
      fn: fn
    });
    
    this.logger.info(`Registered handler: ${id}`);
  }
  
  /**
   * Deregister a previously registered processing handler.
   * @param {Object} handler A handler object returned from a previous call to `registerHandler`.
   */
  deregisterHandler (handler) {
    this._handlers.delete(handler);
    
    this.logger.info(`Deregistered handler: ${handler.id}`);
  }


  /**
   * Inner loop to process blocks.
   */
  _loop () {
    if (!this.isRunning) {
      this.logger.warn('Not running, so exiting loop');
      
      return;
    }

    new Promise((resolve) => {
      const numBlocks = this._blocks.length;
      
      if (!numBlocks) {
        return resolve();
      }
      
      this.logger.info(`Got ${numBlocks} block(s) to process`);
        
      // remove blocks from backlog array
      const blockIds = this._blocks.splice(0, numBlocks);
        
      let blocksProcessed = 0;
      
      for (let blockId of blockIds) {
        this._processBlock(blockId)
        .then(() => {
          blocksProcessed++;
          if (numBlocks <= blocksProcessed) {
            resolve();
          }
        });   
      } 
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
   * @param {String} blockId Block hash.
   * @return {Promise}
   */
  _processBlock (blockId) {
    return new Promise((resolve, reject) => {
      this.logger.info(`Fetching block ${blockId}`);
      
      this._web3.eth.getBlock(blockId, true, (err, block) => {
        if (err) {
          return reject(err);
        } else {
          return resolve(block);
        }
      });
    })
    .then((block) => {
      if (!block) {
        throw new Error(`Invalid block id: ${blockId}`);
      }
      
      this.logger.info(`Processing block #${block.number}: ${block.hash} ...`);
      
      this._invokeHandlers('block', blockId, block);

      this.logger.info(`... done processing block #${block.number}: ${block.hash}`);      
    })
    .catch((err) => {
      this.logger.error(err);
      
      this._invokeHandlers('error', blockId, err);
    });
  }


  /**
   * Callback handler for web3.filter().
   *
   * @param {Error} err If any error occurred.
   * @param {*} result Filter result, usually a block id.
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
   * @param {String} blockId Id of block.
   * @param {Object} data Data to pass along.
   */
  _invokeHandlers (eventType, blockId, data) {
    for (let handler of this._handlers) {
      try {
        handler.fn(eventType, blockId, data);

        this.logger.info(`Invoked handler ${handler.id} for block ${blockId}`);
      } catch (err) {
        this.logger.error(`Handler '${handler.id}' errored for invocation: ${eventType}, ${blockId}`);
      }
    }
  }
}


module.exports = Processor;
