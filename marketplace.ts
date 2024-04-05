/**
 * AltaiLabs
 * Marketplace
 * Version: 1.3.0
 * */
import {
  Args,
  byteToBool,
  bytesToString,
  bytesToU64,
  stringToBytes,
  u64ToBytes,
  unwrapStaticArray,
} from '@massalabs/as-types';
import {
  Address,
  Context,
  Storage,
  call,
  generateEvent,
  sendMessage,
  transferCoins,
  createSC,
} from '@massalabs/massa-as-sdk';
import {
  SellOffer,
  CollectionDetail,
  ItemDetail,
} from '../utilities/marketplace-complex';
import { u256 } from 'as-bignum/assembly';

export const NFT_CONTRACT_CODE_KEY: StaticArray<u8> = [0x01];
export const CREATE_NFT_PRICE_KEY: StaticArray<u8> = [0x02];
export const ownerKey = 'MARKETPLACE_OWNER';
export const sellOfferKey = 'sellOffer_';
export const buyOfferKey = 'buyOffer_';
export const userCollectionsKey = 'collection_';
export const itemCollectionKey = 'item_';

//ASC Settings
export const genesisTimestamp = 1704289800000; //buildnet
export const t0 = 16000;
export const thread_count = 32;

// @custom:security-contact altailabs

export function constructor(binaryArgs: StaticArray<u8>): void {
  // This line is important. It ensures that this function can't be called in the future.
  // If you remove this check, someone could call your constructor function and reset your smart contract.
  if (!Context.isDeployingContract()) {
    return;
  }
  const args = new Args(binaryArgs);
  const marketplaceOwner = args
    .nextString()
    .expect('marketplaceOwner argument is missing or invalid');
  const createNftPrice = args
    .nextU64()
    .expect('nftprice argument is missing or invalid');
  const contractNFT = args
    .nextUint8Array()
    .expect('contract_code argument is missing or invalid');

  const staticArrayNFT: StaticArray<u8> = unwrapStaticArray(contractNFT);

  Storage.set(NFT_CONTRACT_CODE_KEY, staticArrayNFT);
  Storage.set(ownerKey, marketplaceOwner);
  Storage.set(CREATE_NFT_PRICE_KEY, u64ToBytes(createNftPrice));
  generateEvent('NFT Marketplace is deployed...');
}

function _onlyOwner(): bool {
  return Context.caller().toString() == Storage.get(ownerKey);
}
function _weHaveCollection(collectionAddress: string): bool {
  const key = userCollectionsKey + collectionAddress;
  const keyItem = itemCollectionKey + collectionAddress;

  // Check if at least one of the collections exists
  return Storage.has(key) || Storage.has(keyItem);
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
    _weHaveCollection(collectionAddress),
    'Collection or Item not found in marketplace',
  );
  const key = sellOfferKey + collectionAddress + '_' + nftTokenId.toString();
  assert(!Storage.has(key), 'Sell offer already exist');

  const owner = bytesToString(
    call(
      new Address(collectionAddress),
      'ownerOf',
      new Args().add(nftTokenId),
      0,
    ),
  );
  assert(
    owner == creatorAddress,
    'You are not the owner of NFT owner:' +
      owner.toString() +
      ' callerAddress: ' +
      creatorAddress.toString(),
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
  const collectionAddress = args.nextString().unwrap();
  const nftTokenId = args.nextU256().unwrap();
  assert(
    _weHaveCollection(collectionAddress),
    'Collection not found in marketplace',
  );
  const key = sellOfferKey + collectionAddress + '_' + nftTokenId.toString();
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
  let owner = bytesToString(
    call(
      new Address(collectionAddress),
      'ownerOf',
      new Args().add(nftTokenId),
      0,
    ),
  );
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
  const collectionAddress = args.nextString().unwrap();
  const nftTokenId = args.nextU256().unwrap();

  assert(
    _weHaveCollection(collectionAddress),
    'Collection not found in marketplace',
  );
  const key = sellOfferKey + collectionAddress + '_' + nftTokenId.toString();
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
  let owner = bytesToString(
    call(
      new Address(collectionAddress),
      'ownerOf',
      new Args().add(nftTokenId),
      0,
    ),
  );
  const address = Context.caller().toString();

  call(
    new Address(collectionAddress),
    'transferFrom',
    new Args().add(owner).add(address).add(nftTokenId),
    10000000, //0.01MAS
  );
  const pricePercentage = (sellOfferData.price / 100) * 3; // Marketplace wants 3%
  const remainingCoins = sellOfferData.price - pricePercentage;

  transferCoins(new Address(owner), remainingCoins);
  generateEvent(
    `${Context.caller().toString()} bought this ${nftTokenId.toString()} NFT at this ${sellOfferData.price.toString()} price`,
  );

  //Remove sell offer key
  Storage.del(stringToBytes(key));
}

/**
 * @returns Create brand new NFT
 */
export function createNFT(binaryArgs: StaticArray<u8>): void {
  const price = bytesToU64(Storage.get(CREATE_NFT_PRICE_KEY));
  const amount_check = Context.transferredCoins();
  const owner = Context.caller().toString();
  assert(amount_check >= price, 'Insufficient balance for create NFT.');

  const args = new Args(binaryArgs);
  const name = args.nextString().expect('we need the name...');
  const symbol = args.nextString().expect('we need the symbol...');
  const baseURI = args.nextString().expect('we need the baseURI...');
  const tokenURI = args.nextString().expect('we need the tokenURI...');

  assert(name.length <= 30, 'The name is too long.');
  assert(symbol.length <= 8, 'The symbol is too long.');
  assert(baseURI.length > 10, 'baseURI must be entered.');

  const nft_contract_code = Storage.get(NFT_CONTRACT_CODE_KEY);
  const addr = createSC(nft_contract_code);
  call(
    addr,
    'constructor',
    new Args()
      .add(name)
      .add(symbol)
      .add(baseURI)
      .add(tokenURI)
      .add(owner)
      .add(u256.One),
    50000000, //0.05MAS
  );
  const newItem = new ItemDetail(
    name,
    symbol,
    addr.toString(),
    baseURI,
    tokenURI,
  );
  Storage.set(
    stringToBytes(itemCollectionKey + addr.toString()),
    newItem.serialize(),
  );
}

/**
 * @returns Remove Sell offer autonomously when it expires
 */
export function autonomousDeleteOffer(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const collectionAddress = args.nextString().expect('');
  const tokenID = args.nextU64().expect('');

  const caller = Context.caller().toString();
  assert(caller == Context.callee().toString(), 'you are not the SC');

  const key = sellOfferKey + collectionAddress + '_' + tokenID.toString();
  const check = Storage.has(key);
  assert(check, 'sell offer not found');

  Storage.del(stringToBytes(key));
}

// Change Marketplace NFT code
export function adminChangeNFTContractCode(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const contractNFT = args
    .nextUint8Array()
    .expect('contract_code argument is missing or invalid');

  const staticArrayNFT: StaticArray<u8> = unwrapStaticArray(contractNFT);
  Storage.set(NFT_CONTRACT_CODE_KEY, staticArrayNFT);
}

// Add Collection
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

  const key = userCollectionsKey + collectionAddress;
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
  const collectionSCAddress = args.nextString().expect('');
  const key = userCollectionsKey + collectionSCAddress;
  Storage.del(stringToBytes(key));
}

// Change marketplace owner
export function adminChangeMarketplaceOwner(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const newAdmin = args.nextString().unwrap();
  Storage.set(ownerKey, newAdmin);
}

// Send coins someone
export function adminSendCoins(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const address = args.nextString().unwrap();
  const amount = args.nextU64().unwrap(); //nMAS

  transferCoins(new Address(address), amount);
}

// Delete sell offer
export function adminDeleteOffer(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const collectionAddress = args.nextString().unwrap();
  const nftTokenId = args.nextU64().unwrap();
  const key = sellOfferKey + collectionAddress + '_' + nftTokenId.toString();
  Storage.del(stringToBytes(key));
}

// Change collection price
export function adminChangeNFTPrice(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  const newPrice = args.nextU64().unwrap();
  Storage.set(CREATE_NFT_PRICE_KEY, u64ToBytes(newPrice));
}
