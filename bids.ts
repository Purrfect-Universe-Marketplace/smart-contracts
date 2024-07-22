/*
 * Purrfect Marketplace
 * Bids System
 */
import {
  Storage,
  Context,
  generateEvent,
  call,
  Address,
  transferCoins,
} from '@massalabs/massa-as-sdk';
import { Args, stringToBytes } from '@massalabs/as-types';
import {
  _hasCollection,
  _keyGenerator,
  _getNFTOwner,
  calculateMarketplaceFee,
  BID_PREFIX,
} from './marketplace';
import { u256 } from 'as-bignum/assembly';
import { Bid } from '../utilities/marketplace-complex';

/**
 * Bid Key Generator
 * @param collectionAddress
 * @param tokenID
 * @param bidder
 * @returns string key
 */
export function _bidKeyGenerator(
  collectionAddress: string,
  tokenID: u256,
  bidder: string,
): string {
  return (
    BID_PREFIX + collectionAddress + '_' + tokenID.toString() + '_' + bidder
  );
}

/**
 * Reset all bids
 * @param collectionAddress - The address of the NFT collection
 * @param tokenID - The ID of the token whose bids are to be reset
 * @param tokenBuyer - The address of the buyer who won the bid. If this is an empty string (""), all bids will be refunded.
 */
export function resetBids(
  collectionAddress: string,
  tokenID: u256,
  tokenBuyer: string,
): void {
  const prefix = BID_PREFIX + collectionAddress + '_' + tokenID.toString();
  const allKeys = Storage.getKeys(stringToBytes(prefix));

  for (let i = 0; i < allKeys.length; i++) {
    const bidKey = allKeys[i];
    const storedData = Storage.get(bidKey);
    const offset: i32 = 0;
    const bidData = new Bid('', 0, 0);
    const deserializeResult = bidData.deserialize(storedData, offset);
    assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');

    // Only refund if the bidder is not the tokenBuyer
    if (tokenBuyer == '' || bidData.bidder != tokenBuyer) {
      transferCoins(new Address(bidData.bidder), bidData.amount);
    }

    // Delete the bid regardless
    Storage.del(bidKey);
  }
}

/**
 * Add new bid
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * - Bid Amount (Context.transferredCoins())
 * @returns
 * void
 */
export function placeBid(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const nftTokenId = args.nextU256().expect('TokenID not entered.');
  const bidAmount = Context.transferredCoins();

  // Check if the collection exists
  assert(
    _hasCollection(collectionAddress),
    'Collection not found in marketplace',
  );

  const key = _keyGenerator(collectionAddress, nftTokenId);

  // Check if the sell offer exists
  assert(Storage.has(stringToBytes(key)), "Sell offer doesn't exist");

  const bidder = Context.caller().toString();
  const bidTime = Context.timestamp();

  const bidKey = _bidKeyGenerator(collectionAddress, nftTokenId, bidder);

  // Refund if bid is available
  if (Storage.has(stringToBytes(bidKey))) {
    const storedData = Storage.get(stringToBytes(bidKey));
    const offset: i32 = 0;
    const bidData = new Bid('', 0, 0);
    const deserializeResult = bidData.deserialize(storedData, offset);

    assert(
      deserializeResult.isOk(),
      'DESERIALIZATION_ERROR, REFUND IS NOT COMPLETED.',
    );
    transferCoins(new Address(bidData.bidder), bidData.amount);
  }

  // Store the bid
  const bid = new Bid(bidder, bidAmount, bidTime);
  Storage.set(stringToBytes(bidKey), bid.serialize());

  // Generate an event for the new bid
  generateEvent(
    `${bidder} placed a bid on ${collectionAddress} token ${nftTokenId.toString()} with amount ${bidAmount.toString()}`,
  );
}

/**
 * Remove a bid
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * - Bidder address
 * @returns
 * void
 */
export function removeBid(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Enter collection address');
  const nftTokenId = args.nextU256().expect('Enter token id');
  const bidder = Context.caller();

  const bidKey = _bidKeyGenerator(
    collectionAddress,
    nftTokenId,
    bidder.toString(),
  );
  assert(Storage.has(stringToBytes(bidKey)), 'Bid not found');

  const storedData = Storage.get(stringToBytes(bidKey));
  const offset: i32 = 0;
  const bidData = new Bid('', 0, 0);
  const deserializeResult = bidData.deserialize(storedData, offset);

  assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');

  // Transfer amount
  transferCoins(bidder, bidData.amount);
  // Delete Bid
  Storage.del(bidKey);
}

/**
 * Accept a bid
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * - Bidder address (String)
 * @returns
 * void
 */
export function acceptBid(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const nftTokenId = args.nextU256().expect('TokenID not entered.');
  const bidder = args.nextString().expect('Bidder address not entered.');

  const bidKey = _bidKeyGenerator(collectionAddress, nftTokenId, bidder);
  const sellOfferKey = _keyGenerator(collectionAddress, nftTokenId);

  assert(Storage.has(stringToBytes(bidKey)), 'Bid not found');

  const storedData = Storage.get(stringToBytes(bidKey));
  const offset: i32 = 0;
  const bidData = new Bid('', 0, 0);
  const deserializeResult = bidData.deserialize(storedData, offset);

  assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');

  const owner = _getNFTOwner(collectionAddress, nftTokenId);
  assert(
    owner == Context.caller().toString(),
    'You are not the owner of the NFT',
  );

  // Transfer NFT to bidder
  call(
    new Address(collectionAddress),
    'transferFrom',
    new Args().add(owner).add(bidder).add(nftTokenId),
    10_000_000, // 0.01 MAS
  );

  // Calculate the marketplace fee
  const feeAmount = calculateMarketplaceFee(bidData.amount);
  const remainingAmount = bidData.amount - feeAmount;

  transferCoins(new Address(owner), remainingAmount);
  generateEvent(
    `${Context.caller().toString()} accepted a bid from ${bidder} on ${collectionAddress} token ${nftTokenId.toString()} for amount ${bidData.amount.toString()}`,
  );

  // Delete bid data key
  Storage.del(stringToBytes(bidKey));
  // Reset all recent bids
  resetBids(collectionAddress, nftTokenId, bidder);
  // Remove sell offer
  Storage.del(stringToBytes(sellOfferKey));
}
