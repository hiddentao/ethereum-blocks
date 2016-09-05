"use strict";


const LOGGER = {
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
   * @param {Number} [config.loopDelayMs=3000] Milliseconds between checks for new blocks.
   * @param {Object} [config.logger=null] For logging progress updates. If not set then no logging is done. You may set this to `console`.
   * @param {Number} [config.lastBlock=0] Last block that got processed. If set all blocks since will be fetched and processed as soon as the processor starts.
   */
  constructor (config) {
    this._config = config;
    this._web3 = config.web3;
    this._logger = config.logger || LOGGER;
    this._loopDelayMs = config.loopDelayMs || 3000;
    this._lastBlock = config.lastBlock || 0;

    this._blocks = [];
    this._handlers = new Set();
    
    this._filterCallback = this._filterCallback.bind(this);
    this._loop = this._loop.bind(this);
  }

  /**
   * Get whether this processor is connected to the node, i.e. whether web3 is connected.
   * @return {Boolean}
   */
  get isConnected () {
    return !!this._web3.isConnected();
  }


  /**
   * Get whether this processor is currently running.
   * @return {Boolean}
   */
  get isProcessor () {
    return !!this._filter;
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
          
          this._logger.info('Stopped');
          resolve(true);
        } else {
          this._logger.warn('Not currently processing');
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
    return new Promise((resolve, reject) => {
      if (!this.isRunning) {
        this._blocks = [];
        
        this._filter = this.web3.eth.filter('latest');
        
        // need this delay here otherwise when the filter callback gets called, 
        // this._filter may not be set yet. Usually happens if we're mining too 
        // quickly on a private blockchain.
        setTimeout(() => {
          this._filter.watch(this._filterCallback);
          
          this._loop();
          
          resolve(true);
        });
      } else {
        this._logger.warn('Already running');
        
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
    this._logger.info(`Registering handler: ${id}`);
    
    this._handlers.add({
      id: id,
      fn: fn
    });
  }
  
  /**
   * Deregister a previously registered processing handler.
   * @param {Object} handler A handler object returned from a previous call to `registerHandler`.
   */
  deregisterHandler (handler) {
    this._logger.info(`Deregistering handler: ${handler.id}`);

    this._handlers.delete(handler);
  }


  /**
   * Inner loop to process blocks.
   */
  _loop () {
    if (!this.isRunning) {
      this._logger.warn('Not running, so exiting loop');
      
      return;
    }

    if (this._blocks.length) {
      const blockId = this._blocks.shift();

      this._processBlock(blockId)
      .finally(() => {
        if (!this.isRunning) {
          this._logger.warn('Not running, so exiting loop');
          
          return;
        }
          
        this._loopTimeout = setTimeout(this._loop, this._loopDelayMs);
      });
    }
  }


  /**
   * Process given block.
   * @param {String} blockId Block hash.
   * @return {Promise}
   */
  _processBlock (blockId) {
    return new Promise((resolve, reject) => {
      this._logger.info(`Fetching block ${blockId}`);
      
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
      
      this._logger.info(`Processing block #${block.number}: ${block.hash} ...`);
      
      this._invokeHandlers('block', blockId, block);
    })
    .then(() => {
      this._logger.info(`... done processing block #${block.number}: ${block.hash}`);      
    })
    .catch((err) => {
      this._logger.error(err);
      
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
    this._logger.info('Got filter callback');
    
    if (err) {
      return this._logger.error('Got error from filter', err);
    }

    // if not running then skip
    if (!this.isRunning) {
      this._logger.warn('Not currently running, so skipping block');

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
      } catch (err) {
        this._logger.error(`Handler '${handler.id}' errored for invocation: ${eventType}, ${blockId}`);
      }
    }
  }
}


module.exports = Processor;
