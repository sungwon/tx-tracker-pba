import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled
} from "../types"

export default function sungwon(api: API, outputApi: OutputAPI) {

    // Requirements:
    //
    // 1) When a transaction becomes "settled"-which always occurs upon receiving a "newBlock" event-
    //    you must call `outputApi.onTxSettled`.
    //
    //    - Multiple transactions may settle in the same block, so `onTxSettled` could be called
    //      multiple times per "newBlock" event.
    //    - Ensure callbacks are invoked in the same order as the transactions originally arrived.
    //
    // 2) When a transaction becomes "done"-meaning the block it was settled in gets finalized-
    //    you must call `outputApi.onTxDone`.
    //
    //    - Multiple transactions may complete upon a single "finalized" event.
    //    - As above, maintain the original arrival order when invoking `onTxDone`.
    //    - Keep in mind that the "finalized" event is not emitted for all finalized blocks.
    //
    // Notes:
    // - It is **not** ok to make redundant calls to either `onTxSettled` or `onTxDone`.
    // - It is ok to make redundant calls to `getBody`, `isTxValid` and `isTxSuccessful`
    //
    // Bonus 1:
    // - Avoid making redundant calls to `getBody`, `isTxValid` and `isTxSuccessful`.
    //
    // Bonus 2:
    // - Upon receiving a "finalized" event, call `api.unpin` to unpin blocks that are either:
    //     a) pruned, or
    //     b) older than the currently finalized block.


    // keep track of transactions
    // key = tx hash, value = array of block hashes where it was settled, but only if they are on different paths/forks
    const txMap = new Map<string, string[]>();

    // map blocks to their parents so we can trace descendant paths
    const parentMap = new Map<string, string>()

    // keep track of last known finalized block
    let lastFinalized = "";

    // check if curBlock is a descendant of oldBlock 
    const isDescendant = (curBlock: string, oldBlock: string): boolean => {
      while(parentMap.has(curBlock) && parentMap.get(curBlock) != lastFinalized) {
        const parent = parentMap.get(curBlock);
        if (!parent) throw new Error("Invalid parent");
        curBlock = parent;
        if (curBlock === oldBlock) {
          return true;
        }
      }
      return false
    }

    const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
      parentMap.set(blockHash, parent);

      const blockTxs = api.getBody(blockHash);

      // iterate through tx map to maintain order
      txMap.forEach( (settledHashes, curTx) => {
        if (blockTxs.includes(curTx)) {
          
            // add hash if it's in a fork who's ascendants don't have it
            // the hash is the block on which it was settled
            if (settledHashes.length != 0) {
              settledHashes.forEach((settledHash) => {
                if(!isDescendant(blockHash, settledHash)) {
                  settledHashes.push(blockHash);
                }
              });
              
            } 
            txMap.set(curTx, settledHashes); // save blockHash of what block it was settled at 

            if (api.isTxValid(blockHash, curTx)) {
              if (api.isTxSuccessful(blockHash, curTx)) {
                outputApi.onTxSettled(curTx, {blockHash: blockHash, type: "valid", successful: true} )
              } else {
                outputApi.onTxSettled(curTx, {blockHash: blockHash, type: "valid", successful: false} ) 
              }
            } else { // invalid
              outputApi.onTxSettled(curTx, {blockHash: blockHash, type: "invalid"});
            }
        }
      });

    }

    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
      // add to tx tracking data structure
      if (!txMap.has(transaction)) {
        txMap.set(transaction, []);
      }
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      const blockTxs = api.getBody(blockHash);
      
      const parentHash = parentMap.get(blockHash);
      if (parentHash && parentHash !== lastFinalized) {
        // check parent
        onFinalized({ type: "finalized", blockHash: parentHash });
      }
      

      // iterate through tx map to maintain order
      txMap.forEach((settledHashes, curTx) => {

        if (blockTxs.includes(curTx)) {
            // naive approach, not checking forks
            if (settledHashes.length != 0) {

                  if (api.isTxSuccessful(blockHash, curTx)) {
                    outputApi.onTxDone(curTx, {blockHash: blockHash, type: "valid", successful: true} )
                  } else {
                    outputApi.onTxDone(curTx, {blockHash: blockHash, type: "valid", successful: false} ) 
                  }
            } 
        }
      });

      // update last know finalized block
      lastFinalized = blockHash;

    }

    return (event: IncomingEvent) => {
      switch (event.type) {
        case "newBlock": {
          onNewBlock(event)
          break
        }
        case "newTransaction": {
          onNewTx(event)
          break
        }
        case "finalized":
          onFinalized(event)
      }
    }
    
}
