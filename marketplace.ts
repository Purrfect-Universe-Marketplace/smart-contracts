/**
 * Purrfect Universe
 * NFT Marketplace v2.2
 */
import {
  Args,
  byteToBool,
  bytesToString,
  bytesToU64,
  stringToBytes,
  u64ToBytes,
} from '@massalabs/as-types';
import {
  Address,
  Context,
  Storage,
  call,
  generateEvent,
  sendMessage,
  setBytecode,
  transferCoins,
  isAddressEoa,
} from '@massalabs/massa-as-sdk';
import {
  SellOffer,
  CollectionDetail,
  Bid,
} from '../utilities/marketplace-complex';
import { u256 } from 'as-bignum/assembly';
import { resetBids, _bidKeyGenerator } from './bids';

export * from './bids'; // Bids System

//Common Values
export const MARKETPLACE_OWNER_KEY = 'MARKETPLACE_OWNER';
export const MARKETPLACE_FEE_KEY = stringToBytes('MARKETPLACE_FEE');
export const SELL_OFFER_PREFIX = 'sellOffer_';
export const COLLECTION_PREFIX = 'collection_';
export const BID_PREFIX = 'bid_';

//ASC Static Values

export const genesisTimestamp = 1705312800000; // genesis timestamp
export const t0 = 16000;
export const thread_count = 32;

// @custom:security-contact altailabs
export function constructor(binaryArgs: StaticArray<u8>): void {
  if (!Context.isDeployingContract()) {
    return;
  }

  const args = new Args(binaryArgs);
  const marketplaceFee = args
    .nextU64()
    .expect('Marketplace Fee is not entered');

  Storage.set(MARKETPLACE_FEE_KEY, u64ToBytes(marketplaceFee));
  Storage.set(MARKETPLACE_OWNER_KEY, Context.caller().toString());
  generateEvent('Purrfect NFT Marketplace is deployed.');
}

// Common Functions
function _onlyOwner(): bool {
  return Context.caller().toString() == Storage.get(MARKETPLACE_OWNER_KEY);
}

export function _marketplaceOwner(): string {
  return Storage.get(MARKETPLACE_OWNER_KEY);
}
/**
 * Checks whether there is a collection
 * @param collectionAddress
 * @returns bool
 */
export function _hasCollection(collectionAddress: string): bool {
  const key = COLLECTION_PREFIX + collectionAddress;
  // Check if at least one of the collections exists
  return Storage.has(key);
}
/**
 * Sell Offer Key Generator
 * @param address
 * @param tokenID
 * @returns string
 */
export function _keyGenerator(address: string, tokenID: u256): string {
  return SELL_OFFER_PREFIX + address + '_' + tokenID.toString();
}
/**
 * Address NFT ownership check
 * @param address
 * @param tokenID
 * @returns NFT Owner Address
 */
export function _getNFTOwner(address: string, tokenID: u256): string {
  return bytesToString(
    call(new Address(address), 'ownerOf', new Args().add(tokenID), 0),
  );
}
/**
 * Calculate Marketplace Fee
 * @param amount
 * @returns u64
 */
export function calculateMarketplaceFee(amount: u64): u64 {
  const marketplaceFee = bytesToU64(Storage.get(MARKETPLACE_FEE_KEY));
  const feeAmount = (amount / 100) * marketplaceFee;
  return feeAmount;
}

/**
 * Add new sell offer
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * - Price (u64)
 * - Expire Time (u64) -> Added on top of the current time
 * @returns
 * void
 */
export function sellOffer(binaryArgs: StaticArray<u8>): void {
  //args
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const nftTokenId = args.nextU256().expect('TokenID not entered.');
  const price = args.nextU64().expect('Exptected Price not entered.');
  const expireIn = args.nextU64().expect('Expire In not entered.');

  //date
  const expirationTime = Context.timestamp() + expireIn;
  const creatorAddress = Context.caller().toString();
  const createdTime = Context.timestamp();

  assert(
    isAddressEoa(creatorAddress),
    'Smart contract address is not support.',
  );

  assert(
    expirationTime > Context.timestamp(),
    'The end time must be greater than the Context.timestamp()',
  );
  assert(
    _hasCollection(collectionAddress),
    'Collection or Item not found in marketplace',
  );
  const key = _keyGenerator(collectionAddress, nftTokenId);

  assert(!Storage.has(key), 'Sell offer already exist');

  const owner = _getNFTOwner(collectionAddress, nftTokenId);
  assert(
    owner == creatorAddress,
    'You are not the owner of NFT owner:' +
      owner +
      ' callerAddress: ' +
      creatorAddress,
  );

  const approved = byteToBool(
    call(
      new Address(collectionAddress),
      'isApprovedForAll',
      new Args().add(creatorAddress).add(Context.callee().toString()),
      0,
    ),
  );
  assert(approved, 'Marketplace not approved for trading');

  const newSellOffer = new SellOffer(
    collectionAddress,
    nftTokenId.toString(),
    price,
    creatorAddress,
    expirationTime,
    createdTime,
  );

  Storage.set(stringToBytes(key), newSellOffer.serialize());

  //send ASC Message for delete when time is up
  const startPeriod = floor((expirationTime - genesisTimestamp) / t0);
  const startThread = floor(
    (expirationTime - genesisTimestamp - startPeriod * t0) /
      (t0 / thread_count),
  ) as u8;
  const endPeriod = startPeriod + 10;
  const endThread = 31 as u8;

  const maxGas = 1_000_000_000; // gas for smart contract execution
  const rawFee = 50_000_000; // 0.05 fee
  const coins = 0;

  const scaddr = Context.callee();
  sendMessage(
    scaddr,
    'autonomousDeleteOffer',
    startPeriod,
    startThread,
    endPeriod,
    endThread,
    maxGas,
    rawFee,
    coins,
    new Args().add(collectionAddress).add(nftTokenId).serialize(),
  );
  generateEvent(
    'autonomous remove started for the ' +
      collectionAddress +
      '_' +
      nftTokenId.toString(),
  );
}
/**
 * Remove current sell offer
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * @returns
 * void
 */
export function removeSellOffer(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const nftTokenId = args.nextU256().expect('Token ID not entered');
  assert(
    _hasCollection(collectionAddress),
    'Collection not found in marketplace',
  );
  const key = _keyGenerator(collectionAddress, nftTokenId);

  assert(Storage.has(key), 'Sell offer doesnt exist');

  const owner = _getNFTOwner(collectionAddress, nftTokenId);
  assert(owner == Context.caller().toString(), 'You are not the owner of NFT');

  resetBids(collectionAddress, nftTokenId, ''); // Reset active bids
  Storage.del(stringToBytes(key));
  generateEvent('REMOVE_SELL_OFFER : ' + Context.caller().toString());
}

/**
 * Direct Buy Offer
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * @requires
 * - Coverage of the sale price
 * @returns
 * void
 */
export function buyOffer(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const nftTokenId = args.nextU256().expect('TokenID not entered.');

  assert(
    _hasCollection(collectionAddress),
    'Collection not found in marketplace',
  );
  const key = _keyGenerator(collectionAddress, nftTokenId);

  assert(Storage.has(key), 'Sell offer doesnt exist');

  const storedData = Storage.get(stringToBytes(key));
  const offset: i32 = 0;
  const sellOfferData = new SellOffer('', '', 0, '', 0, 0);
  const deserializeResult = sellOfferData.deserialize(storedData, offset);

  assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');

  const expirationTime = sellOfferData.expirationTime;

  assert(Context.timestamp() <= expirationTime, 'Sell offer has expired');

  assert(
    Context.transferredCoins() >= sellOfferData.price,
    'Could not send enough coins to buy this NFT',
  );

  const owner = _getNFTOwner(collectionAddress, nftTokenId);
  const address = Context.caller().toString();

  assert(isAddressEoa(address), 'Smart contract cant buy.');

  // PURCHASED, TOKEN SENDED TO NEW OWNER
  call(
    new Address(collectionAddress),
    'transferFrom',
    new Args().add(owner).add(address).add(nftTokenId),
    10_000_000, //0.01MAS
  );

  const feeAmount = calculateMarketplaceFee(sellOfferData.price);
  const remainingCoins = sellOfferData.price - feeAmount;

  transferCoins(new Address(_marketplaceOwner()), feeAmount); // Transfer Marketplace Service Fee to Owner
  transferCoins(new Address(owner), remainingCoins); // Transfer NFT Price
  generateEvent(
    `${Context.caller().toString()} bought this ${nftTokenId.toString()} NFT at this ${sellOfferData.price.toString()} price`,
  );

  resetBids(collectionAddress, nftTokenId, ''); // Reset all bids
  Storage.del(stringToBytes(key)); // Delete sell offer
}

/**
 * @returns Remove Sell offer and bids autonomously when it expires
 */
export function autonomousDeleteOffer(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const tokenID = args.nextU256().expect('TokenID not entered.');

  const caller = Context.caller().toString();
  assert(caller == Context.callee().toString(), 'You are not root SC.');

  const key = _keyGenerator(collectionAddress, tokenID);
  const check = Storage.has(key);
  assert(check, 'sell offer not found');

  // resetBids(collectionAddress, tokenID, ''); //DONT REMOVE BIDS
  Storage.del(stringToBytes(key));
  generateEvent(key + ' expired and removed');
}

/**
 *  - This allows you to add the collection you want to list
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection front end name (String)
 * - collection desc (String)
 * - collection sc address (String)
 * - collection website (String)
 * - Banner Image Link for Front-End (String)
 * - Collection Background Image Link for Front-End (String)
 * - Collection Logo Image Link for Front-End (String)
 * @requires
 * Only owner can add
 */
export function adminAddCollection(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const collectionName = args
    .nextString()
    .expect('You did not enter the collection name');
  const collectionDesc = args
    .nextString()
    .expect('You did not enter the collection description');
  const collectionAddress = args
    .nextString()
    .expect('You did not enter the collection smart contract address');
  const collectionWebsite = args
    .nextString()
    .expect('You did not enter the collection website');
  const bannerImage = args
    .nextString()
    .expect('You did not enter the collection banner image link');
  const collectionBackgroundImage = args
    .nextString()
    .expect(
      'You did not enter the collection collection background image link',
    );
  const collectionLogoImage = args
    .nextString()
    .expect('You did not enter the collection logo image link');

  const key = COLLECTION_PREFIX + collectionAddress;
  const collection = new CollectionDetail(
    collectionName,
    collectionDesc,
    collectionAddress,
    collectionWebsite,
    bannerImage,
    collectionBackgroundImage,
    collectionLogoImage,
  );
  Storage.set(stringToBytes(key), collection.serialize());
}

/**
 *  - This allows you to remove the already deployed collection
 * @requires
 * Only owner can add
 */
export function adminDeleteCollection(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const collectionSCAddress = args
    .nextString()
    .expect('Collection address not entered');
  const key = COLLECTION_PREFIX + collectionSCAddress;

  const has = Storage.has(stringToBytes(key));
  assert(has, 'Collection is not found');
  Storage.del(stringToBytes(key));
}

/**
 *  - This allows you to change the marketplace owner
 * @requires
 * Only owner can add
 */
export function adminChangeMarketplaceOwner(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const newAdmin = args.nextString().expect('New Admin Address not entered.');
  Storage.set(MARKETPLACE_OWNER_KEY, newAdmin);
}

/**
 *  - Sends coins to someone
 * @requires
 * Only owner can add
 */
export function adminSendCoins(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const address = args.nextString().expect('Target address not entered.');
  const amount = args.nextU64().expect('Target amount not entered'); //nMAS

  transferCoins(new Address(address), amount);
}

/**
 *  - Admin remove a sell offer
 * @requires
 * Only owner can add
 */
export function adminDeleteOffer(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not found');
  const nftTokenId = args.nextU256().expect('Collection address not found.');

  const key = _keyGenerator(collectionAddress, nftTokenId);

  resetBids(collectionAddress, nftTokenId, ''); // Reset active bids
  Storage.del(stringToBytes(key)); // Remove sell offer
}

/**
 *  - Admin remove a bid offer
 * @requires
 * Only owner can add
 */
export function adminRemoveBid(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');

  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Enter collection address');
  const nftTokenId = args.nextU256().expect('Enter token id');
  const bidder = args.nextString().expect('Enter bidder address');

  const bidKey = _bidKeyGenerator(collectionAddress, nftTokenId, bidder);
  assert(Storage.has(stringToBytes(bidKey)), 'Bid not found');

  const storedData = Storage.get(stringToBytes(bidKey));
  const offset: i32 = 0;
  const bidData = new Bid('', 0, 0);
  const deserializeResult = bidData.deserialize(storedData, offset);

  assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');
  // Transfer amount
  transferCoins(new Address(bidder), bidData.amount);
  // Delete Bid
  Storage.del(bidKey);
}

/**
 *  - Admin change marketplace fee
 * @requires
 * Only owner can add
 */
export function adminChangeMarketplaceFee(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const newFee = args.nextU64().expect('Marketplace new fee not entered.');

  Storage.set(MARKETPLACE_FEE_KEY, u64ToBytes(newFee));
}

/**
 *  - Admin upgrade marketplace code
 * @requires
 * Only owner can add
 */
export function upgradeSmartContract(newBytecode: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  setBytecode(newBytecode);
}

/**
 * Receive some coins
 * @param binaryArgs
 *
 */
export function receiveCoins(binaryArgs: StaticArray<u8>): void {}
