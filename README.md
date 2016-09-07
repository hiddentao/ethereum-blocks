# ethereum-blocks

[![Build Status](https://secure.travis-ci.org/hiddentao/ethereum-blocks.png?branch=master)](http://travis-ci.org/hiddentao/ethereum-blocks) [![NPM module](https://badge.fury.io/js/ethereum-blocks.png)](https://badge.fury.io/js/ethereum-blocks) [![Twitter URL](https://img.shields.io/twitter/url/http/shields.io.svg?style=social&label=Follow&maxAge=2592000)](https://twitter.com/hiddentao)

Process blocks from an Ethereum [web3](https://github.com/ethereum/web3.js/) instance robustly.

This library uses [web3.eth.filter](https://github.com/ethereum/wiki/wiki/JavaScript-API#web3ethfilter) to listen for the latest blocks on a 
chain. When a block is received all registered handlers are invoked to perform any 
required processing on the block data.

Features:

* Works with any [web3](https://github.com/ethereum/web3.js/) instance
* No dependencies - works in Node, Electron apps and browsers
* Can *catch up* on all missed blocks when restarted
* Detects if connection has dropped and waits until re-established
* Processing handlers can be asynchronous
* Errors are gracefully handled
* Customizable logging, can be turned on/off at runtime
* Automated [tests](https://travis-ci.org/hiddentao/ethereum-blocks)

## Installation

```shell
$ npm install ethereum-blocks
```

## Usage

```js
import Web3 from 'web3';
import EthereumBlocks from 'ethereum-blocks';

const web3 = new Web3(/* connect to running Geth node */);

// create a new instance
const blocks = new EthereumBlocks({ web3: web3 });

// register a handler called "myHandler"
blocks.registerHandler('myHandler', (eventType, blockId, data) => {
  switch (eventType) {
    case 'block':
      /* data = result of web3.eth.getBlock(blockId) */
      console.log('Block id', blockId);
      console.log('Block nonce', data.nonce);
      break;
    case 'error':
      /* data = Error instance */
      console.error(data);
      break;
  }
});

// start the block processor
blocks.start().catch(console.error);
```

### Starting and stopping

The `start()` and `stop()` methods are used for starting and stopping the block processor. Both are asynchronous and return `Promise` objects which resolve to a boolean indicating whether there 
was a change of state.

Starting it:

```js
blocks.start()
.then((started) => {
  console.log( started ? 'Started' : 'Already running');
  
  console.log( blocks.isRunning ); /* true */
})
.catch((err) => {
  /* error */

  console.log( blocks.isRunning ); /* false */  
})
```

Stopping it:

```js
blocks.stop()
.then((stopped) => {
  console.log( stopped ? 'Stopped' : 'Was not running');
  
  console.log( blocks.isRunning ); /* false */
})
.catch((err) => {
  /* error */
})
```

As shown above, the `isRunning` property can be used to check the current status of the processor at any point in time.


### Catching up with missed blocks

If you are re-starting the block processor after having previously stopped it 
(e.g. if your app restarted) then it is useful to be able to *catch up* on any 
blocks you may have missed in the intervening period. 

To do this you first need the id/number of the last block which got processed. 
This can be obtained at any time using the `lastBlock` property. You could store 
this value in storage for use later on:

```js
window.localStorage.set('lastBlock', blocks.lastBlock);
```

Then next time your app starts up you can retrieve this value and tell the 
block processor to process all blocks which came after this one up until 
the current block, before then watching for new blocks:

```js
const lastBlockProcessed = window.localStorage.get('lastBlock');

blocks.start({
  catchupFrom: lastBlockProcessed ? Number(lastBlockProcessed) : null,
});
```

New incoming blocks will be added to the processing queue AFTER all the blocks from the `catchupFrom` block until the current one. 

### Handlers

Handlers are functions which get passed the block data in order to do any actual processing needed. To add and remove them:


* `registerHandler(id: String, fn: Function)` - an `id` is required just so that the handler can be referred to in log messages. The `fn` handler function should have the signature `(eventType, blockId, data)`:
  * `eventType` - {String} The event type (either "block" or "error")
  * `blockId` - {String} Id of block.
  * `data` - {Object} Block data or error object.
* `deregisterHandler(id: String)` - the `id` must be the same one that you passed in to the registration call.

*Note: If you call `registerHandler` with the same `id` more than once then the handler function sent in the latest call will be the one which gets invoked.*

If a handler function returns a `Promise` then it is treated as an asynchronous function. You can register both synchronous and asynchronous handlers with the same block processor. Processing on a given block is only considered complete when all handlers have finished executing (asynchronous or otherwise).

*Note: If a handler throws an error it will be caught and logged, but the other registered handlers will still get executed.*


### Logger

By default internal logging is silent. But you can turn on logging at any time by setting the `logger` property:

```js
blocks.logger = console;	/* log everything to console */
```

The supplied logger object must have 3 methods: `info`, `warn` and `error`. If any one of these methods isn't provided then the built-in method (i.e. silent method) get used. For example:

```js
// let's output only the error messages
blocks.logger = {
	error: console.error.bind(console)
}
```

### Handling node connection failures

If the web3 connection to the client node fails (e.g. because the node crashes) then the block processor is intelligent enough to detect this and wait for the connection to be re-established before resuming processing.

To check to see if the connection is active use the `isConnected` property. For example, let's say we called `start()` and the connection to the node then went down we would have:

```js
console.log( blocks.isRunning );  /* true */
console.log( blocks.isConnected );	/* false */
```

The processor will check every `connectionCheckInterval` milliseconds to see if the connection has been established. You can get or set this property at runtime to check more or less often:

```js
console.log( blocks.connectionCheckInterval );  /* 5000 */

blocks.connectionCheckInterval = 100; /* change it to check every 100ms */
```

### Processing loop interval

You can change set how often the processing loop should run using the `loopInterval` property. This is measured in milliseconds and is 5000 by default (i.e. 5 seconds):

```js
console.log( blocks.loopInterval );  /* 5000 */

blocks.loopInterval = 100; /* run the processing loop every 100ms */
```


### Browser usage

If you are not using a packaging manager and are instead importing [ethereumBlocks.js](dist/ethereumBlocks.js) directly then the class is exposed on the global object as `EthereumBlocks`. Thus, in the browser window context you would use it like this:

```js
const blocks = new window.EthereumBlocks({ web3: web3 });
```

## Development

To build and run the tests:

```shell
$ npm install
$ npm test
```


## Contributions

Contributions welcome - see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT - see [LICENSE.md](LICENSE.md)

