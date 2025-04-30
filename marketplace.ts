/**
 * Purrfect Universe
 * NFT Marketplace v4.0
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
export * from './tokenOffers'; // Token Payment System

//Common Values
export const MARKETPLACE_OWNER_KEY = 'MARKETPLACE_OWNER';
export const MARKETPLACE_FEE_KEY = stringToBytes('MARKETPLACE_FEE');
export const SELL_OFFER_PREFIX = 'sellOffer_';
export const COLLECTION_PREFIX = 'collection_';
export const BID_PREFIX = 'bid_';
export const TOKEN_PREFIX = 'token_';

//ASC Static Values

export const genesisTimestamp = 1705312800000; // genesis timestamp
export const t0: u64 = 16;

// @custom:security-contact altailabs
export function constructor(binaryArgs: StaticArray<u8>): void {
  if (!Context.isDeployingContract()) {
    return;
  }

  const args = new Args(binaryArgs);
  const marketplaceFee = args
    .nextU64()
    .expect('Marketplace Fee is not entered');
  const tokenScAddress = args
    .nextString()
    .expect('Token SC Address is not entered');

  Storage.set(MARKETPLACE_FEE_KEY, u64ToBytes(marketplaceFee));
  Storage.set(MARKETPLACE_OWNER_KEY, Context.caller().toString());
  Storage.set(TOKEN_PREFIX, tokenScAddress);
  generateEvent('Purrfect NFT Marketplace is deployed.');
}

/**
 * Schedules an autonomous deletion message for a sell offer.
 * @param expirationTime - The timestamp when the offer expires (u64)
 * @param collectionAddress - The address of the NFT collection (string)
 * @param nftTokenId - The token ID of the NFT (u256)
 */
export function scheduleOfferDeletion(
  expirationTime: u64,
  collectionAddress: string,
  nftTokenId: u256,
): void {
  // 1) Past tense control
  assert(
    expirationTime > Context.timestamp(),
    'Expiration must be in the future',
  );

  // 2) Calculate how many periods to skip forward (by integer division)
  const now: u64 = Context.timestamp();
  const delta: u64 = expirationTime - now;

  // Ensure t0 is correct and handle edge cases
  const t0: u64 = 16; // Slot period duration
  const nbPeriods: u64 = delta / t0;

  // Add safety margin for period calculation
  const safetyMargin: u64 = 2; // Additional periods for safety
  const nbPeriodsWithMargin: u64 = nbPeriods + safetyMargin;

  // 3) Specify start and end slots (period + thread)
  const startPeriod: u64 = Context.currentPeriod() + nbPeriodsWithMargin;
  const startThread: u8 = Context.currentThread() as u8;
  const endPeriod: u64 = startPeriod + 20; // Increased window for execution
  const endThread: u8 = startThread;

  // 4) Gas and fee settings - increased for reliability
  const maxGas: u64 = 20_000_000; // Increased gas limit
  const rawFee: u64 = 50_000_000; // Increased fee
  const coins: u64 = 0;

  // 5) Prepare message parameters
  const payload = new Args().add(collectionAddress).add(nftTokenId).serialize();

  // 6) Log the scheduling attempt
  generateEvent(
    `Scheduling deletion for NFT ${nftTokenId.toString()} at period ${startPeriod.toString()}`,
  );

  // 7) Send the message with increased parameters
  const scAddr = Context.callee();
  sendMessage(
    scAddr,
    'autonomousDeleteOffer',
    startPeriod,
    startThread,
    endPeriod,
    endThread,
    maxGas,
    rawFee,
    coins,
    payload,
    new Address(),
    new StaticArray<u8>(0),
  );

  // 8) Log successful scheduling
  generateEvent(
    `Deletion scheduled for NFT ${nftTokenId.toString()} successfully`,
  );
}

// Common Functions
function _onlyOwner(): bool {
  return Context.caller().toString() == Storage.get(MARKETPLACE_OWNER_KEY);
}

/**
 * Send NFT
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - Collection Address (String)
 * - from (String)
 * - to (String)
 * - Token ID (u256)
 */
export function sendNFT(
  collectionAddress: string,
  from: string,
  to: string,
  tokenId: u256,
): void {
  call(
    new Address(collectionAddress),
    'transferFrom',
    new Args().add(from).add(to).add(tokenId),
    0,
  );
}

/**
 * Get Token Address
 * @returns string
 */
export function _getTokenAddress(): string {
  return Storage.get(TOKEN_PREFIX);
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
 * Add standart sell offer
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
    false,
    new u256(0),
  );

  Storage.set(stringToBytes(key), newSellOffer.serialize());

  generateEvent(
    `${Context.caller().toString()} added a sell offer for ${nftTokenId.toString()} NFT at ${price.toString()} price`,
  );
  // Send ASC Message to delete the offer when it expires
  scheduleOfferDeletion(expirationTime, collectionAddress, nftTokenId);
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

  Storage.del(stringToBytes(key));
  generateEvent('REMOVE_SELL_OFFER : ' + Context.caller().toString());
}

/**
 * Direct Buy Offer ( only MAS )
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
  const sellOfferData = new SellOffer('', '', 0, '', 0, 0, false, new u256(0));
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

  // PURCHASED, NFT SENDED TO NEW OWNER
  sendNFT(collectionAddress, owner, address, nftTokenId);

  const feeAmount = calculateMarketplaceFee(sellOfferData.price);
  const remainingCoins = sellOfferData.price - feeAmount;

  transferCoins(new Address(_marketplaceOwner()), feeAmount); // Transfer Marketplace Service Fee to Admin
  transferCoins(new Address(owner), remainingCoins); // Transfer NFT Price to old owner
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
 * - Admin set token address
 * @param binaryArgs
 * @returns
 * void
 * @requires
 * Only owner can add
 */
export function adminSetTokenAddress(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const tokenAddress = args.nextString().expect('Token address not entered.');
  Storage.set(TOKEN_PREFIX, tokenAddress);
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
