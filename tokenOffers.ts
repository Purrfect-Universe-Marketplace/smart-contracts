/*
 * Purrfect NFT Marketplace
 * Token Buy System
 */
import {
  Args,
  stringToBytes,
  byteToBool,
  bytesToU256,
} from '@massalabs/as-types';
import {
  _hasCollection,
  _keyGenerator,
  _getTokenAddress,
  _getNFTOwner,
  scheduleOfferDeletion,
  sendNFT,
} from './marketplace';
import {
  Storage,
  Context,
  call,
  Address,
  generateEvent,
  isAddressEoa,
} from '@massalabs/massa-as-sdk';
import { SellOffer } from '../utilities/marketplace-complex';
import { u256 } from 'as-bignum/assembly';
import { resetBids } from './marketplace';

// Token helpers
function checkAllowance(spender: string, amount: u256): void {
  const allowance = bytesToU256(
    call(
      new Address(_getTokenAddress()),
      'allowance',
      new Args().add(new Address(spender)).add(Context.callee()),
      0,
    ),
  );
  assert(
    allowance >= amount,
    `Not enough allowance, actual ${allowance}, required ${amount}`,
  );
}

function sendFT(address: string, owner: string, amount: u256): void {
  call(
    new Address(_getTokenAddress()),
    'transferFrom',
    new Args().add(new Address(address)).add(new Address(owner)).add(amount),
    0,
  );
}

/**
 * Direct Buy Offer with PUR Token
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * @requires
 * - Coverage of the sale price
 * @returns
 * void
 */
export function buyOfferWithPUR(binaryArgs: StaticArray<u8>): void {
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

  generateEvent('Generated Key: ' + key);
  generateEvent('Storage.has(key): ' + Storage.has(key).toString());

  assert(Storage.has(key), 'Sell offer doesnt exist');

  const storedData = Storage.get(stringToBytes(key));
  const offset: i32 = 0;
  const sellOfferData = new SellOffer('', '', 0, '', 0, 0, false, new u256(0));
  const deserializeResult = sellOfferData.deserialize(storedData, offset);

  assert(deserializeResult.isOk(), 'DESERIALIZATION_ERROR');

  const expirationTime = sellOfferData.expirationTime;

  assert(Context.timestamp() <= expirationTime, 'Sell offer has expired');
  const address = Context.caller().toString();

  generateEvent('Address: ' + address);
  generateEvent('Expiration Time: ' + expirationTime.toString());
  generateEvent('Current Time: ' + Context.timestamp().toString());
  generateEvent('Sell Offer Data: ' + sellOfferData.tokenPrice.toString());

  // CHECK ALLOWANCE OF PUR
  checkAllowance(address, sellOfferData.tokenPrice);

  const owner = _getNFTOwner(collectionAddress, nftTokenId);

  generateEvent('Owner: ' + owner);
  assert(isAddressEoa(address), 'Smart contract cant buy.');

  // PURCHASED, NFT SENDED TO NEW OWNER
  sendNFT(collectionAddress, owner, address, nftTokenId);

  // SEND PUR TOKENS TO SELLER
  sendFT(address, owner, sellOfferData.tokenPrice);

  generateEvent(
    `${Context.caller().toString()} bought this ${nftTokenId.toString()} NFT at this ${sellOfferData.tokenPrice.toString()} PUR`,
  );

  // resetBids(collectionAddress, nftTokenId, ''); // Reset all bids
  generateEvent('Reset all bids for this NFT');
  Storage.del(stringToBytes(key)); // Delete sell offer
}

/**
 * Sell Offer With PUR Token
 *
 * @param binaryArgs - serialized StaticArray<u8> containing
 * - collection address (String)
 * - Token Id (u256)
 * - Price (u64)
 * - Expire Time (u64) -> Added on top of the current time
 * @returns
 * void
 */
export function sellOfferWithPUR(binaryArgs: StaticArray<u8>): void {
  //args
  const args = new Args(binaryArgs);
  const collectionAddress = args
    .nextString()
    .expect('Collection address not entered.');
  const nftTokenId = args.nextU256().expect('TokenID not entered.');
  const price = args.nextU256().expect('Exptected Price not entered.');
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

  generateEvent('Generated Key: ' + key);
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
    0,
    creatorAddress,
    expirationTime,
    createdTime,
    true,
    price,
  );

  Storage.set(stringToBytes(key), newSellOffer.serialize());

  generateEvent(
    `${Context.caller().toString()} added a sell offer for ${nftTokenId.toString()} NFT at ${price.toString()} PUR with expiration time ${expirationTime.toString()} `,
  );

  // Send ASC message with function
  scheduleOfferDeletion(expirationTime, collectionAddress, nftTokenId);
}
