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

  const txMap = new Map<string, string>();

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



    const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
      // TODO:: implement it
      const blockTxs = api.getBody(blockHash)

      // iterate through tx map to maintain order
      txMap.forEach( (curTx, status) => {
        if (blockTxs.includes(curTx) && status != "settled") {
            txMap.set(curTx, "settled");

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
      // TODO:: implement it
      // add to tx tracking data structure
      if (!txMap.has(transaction)) {
        txMap.set(transaction, "new");
      }
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      // TODO:: implement it

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
