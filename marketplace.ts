/**
 * AltaiLabs
 * Marketplace
 * */
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
  transferCoins,
  balance,
} from '@massalabs/massa-as-sdk';
import { SellOffer, CollectionDetail } from '../utilities/marketplace-complex';
import { u256 } from 'as-bignum/assembly';

export const MARKETPLACE_OWNER_KEY = 'MARKETPLACE_OWNER';
export const MARKETPLACE_FEE_KEY = stringToBytes('MARKETPLACE_FEE');
export const SELL_OFFER_PREFIX = 'sellOffer_';
export const BUY_OFFER_PREFIX = 'buyOffer_';
export const COLLECTION_PREFIX = 'collection_';

//STATIC VALUES
export const genesisTimestamp = 1704289800000; //buildnet genesis timestamp
export const t0 = 16000;
export const thread_count = 32;

// @custom:security-contact altailabs
export function constructor(binaryArgs: StaticArray<u8>): void {
  if (!Context.isDeployingContract()) {
    return;
  }
  const args = new Args(binaryArgs);
  const marketplaceFee = args.nextU64().expect('Marketplace Fee Not entered.');
  Storage.set(MARKETPLACE_FEE_KEY, u64ToBytes(marketplaceFee));
  Storage.set(MARKETPLACE_OWNER_KEY, Context.caller().toString());
  generateEvent('NFT Marketplace is deployed...');
}

function _onlyOwner(): bool {
  return Context.caller().toString() == Storage.get(MARKETPLACE_OWNER_KEY);
}
function _hasCollection(collectionAddress: string): bool {
  const key = COLLECTION_PREFIX + collectionAddress;

  // Check if at least one of the collections exists
  return Storage.has(key);
}

function _keyGenerator(address: string, tokenID: u256): string {
  return SELL_OFFER_PREFIX + address + '_' + tokenID.toString();
}
function _getNFTOwner(address: string, tokenID: u256): string {
  return bytesToString(
    call(new Address(address), 'ownerOf', new Args().add(tokenID), 0),
  );
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
  const collectionAddress = args.nextString().unwrap();
  const nftTokenId = args.nextU256().unwrap();
  const price = args.nextU64().unwrap();
  const expireIn = args.nextU64().unwrap();

  //date
  const expirationTime = Context.timestamp() + expireIn;
  const creatorAddress = Context.caller().toString();
  const createdTime = Context.timestamp();

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
  // !!! Risk of underflow here. expirationTime could be less than genesisTimestamp !!!
  // You should check if expirationTime is greater than genesisTimestamp before calculating startPeriod.
  const startPeriod = floor((expirationTime - genesisTimestamp) / t0);
  const startThread = floor(
    (expirationTime - genesisTimestamp - startPeriod * t0) /
      (t0 / thread_count),
  ) as u8;
  const endPeriod = startPeriod + 10;
  const endThread = 31 as u8;

  const maxGas = 500_000_000; // gas for smart contract execution
  const rawFee = 0;
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

  const storedData = Storage.get(stringToBytes(key));
  const offset: i32 = 0;
  const sellOfferData = new SellOffer('', '', 0, '', 0, 0);
  const deserializeResult = sellOfferData.deserialize(storedData, offset);

  assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');

  assert(
    sellOfferData.creatorAddress == Context.caller().toString(),
    'Only the creator can remove the sell offer',
  );
  const owner = _getNFTOwner(collectionAddress, nftTokenId);

  assert(owner == Context.caller().toString(), 'You are not the owner of NFT');
  Storage.del(stringToBytes(key));
  generateEvent('REMOVE_SELL_OFFER : ' + Context.caller().toString());
}

/**
 * Buy Offer
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
    'Could not send enough money or marketplace fees to buy this NFT',
  );

  const owner = _getNFTOwner(collectionAddress, nftTokenId);
  const address = Context.caller().toString();

  // PURCHASED, TOKEN SENDED TO NEW OWNER
  call(
    new Address(collectionAddress),
    'transferFrom',
    new Args().add(owner).add(address).add(nftTokenId),
    10_000_000, //0.01MAS
  );

  const marketplaceFee = bytesToU64(Storage.get(MARKETPLACE_FEE_KEY));
  const pricePercentage = (sellOfferData.price / 100) * marketplaceFee; // Marketplace wants 3%
  const remainingCoins = sellOfferData.price - pricePercentage;

  transferCoins(new Address(owner), remainingCoins);
  generateEvent(
    `${Context.caller().toString()} bought this ${nftTokenId.toString()} NFT at this ${sellOfferData.price.toString()} price`,
  );

  //Remove sell offer key
  Storage.del(stringToBytes(key));
}

/**
 * @returns Remove Sell offer autonomously when it expires
 */
export function autonomousDeleteOffer(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const tokenID = args.nextU256().expect('TokenID not entered.');

  const caller = Context.caller().toString();
  assert(caller == Context.callee().toString(), 'you are not the SC');

  const key = _keyGenerator(collectionAddress, tokenID);
  const check = Storage.has(key);
  assert(check, 'sell offer not found');

  Storage.del(stringToBytes(key));
}

/*
This allows you to add the already deployed collection you want to list
*/
export function adminAddCollection(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const collectionName = args.nextString().expect('');
  const collectionDesc = args.nextString().expect('');
  const collectionAddress = args.nextString().expect('');
  const collectionWebsite = args.nextString().expect('');
  const bannerImage = args.nextString().expect('');
  const collectionBackgroundImage = args.nextString().expect('');
  const collectionLogoImage = args.nextString().expect('');

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

// Remove Collection
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

// Change marketplace owner
export function adminChangeMarketplaceOwner(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const newAdmin = args.nextString().expect('New Admin Address not entered.');
  Storage.set(MARKETPLACE_OWNER_KEY, newAdmin);
}

// Send coins someone
export function adminSendCoins(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const address = args.nextString().expect('Target address not entered.');
  const amount = args.nextU64().expect('Target amount not entered'); //nMAS

  const scBalance = balance();
  assert(
    scBalance < amount,
    'No funds were found for the amount you wanted to send.',
  );
  transferCoins(new Address(address), amount);
}

// Delete sell offer
export function adminDeleteOffer(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not found');
  const nftTokenId = args.nextU256().expect('Collection address not found.');

  const key = _keyGenerator(collectionAddress, nftTokenId);
  Storage.del(stringToBytes(key));
}

// Change Marketplace Fee
export function adminChangeMarketplaceFee(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const marketplaceFee = args
    .nextU64()
    .expect('Marketplace Fee is not entered.');

  Storage.set(MARKETPLACE_FEE_KEY, u64ToBytes(marketplaceFee));
}
